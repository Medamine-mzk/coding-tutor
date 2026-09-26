# Pivot Addendum: Teacher-Authored Exercises

This document changes the platform's intake model. It sits alongside `PROJECT_SPEC.md`, `integration-hint-pipeline-v2.md`, and `step-plan-and-exercise-cache-addendum.md` — those three still govern the IDE, sandbox, hint ladder, `Step` schema, and the two-stage verified generation pipeline **unchanged**. This file changes **who creates an exercise and how a student reaches it**, and downgrades one piece of prior work from required to optional. Read Section 0 first — it tells you what NOT to rebuild.

---

## 0. What stays, what changes, what's now optional

**Stays exactly as built:**
- Sandbox + tamper-resistant test harness
- `Step` / `IOTest` / `FunctionTest` / `ASTCheck` schema
- Stage A (solve + verify) → Stage B (decompose + verify) generation pipeline
- Hint ladder, diagnostics, redaction, anti-leak validator
- Progressive disclosure (`toExerciseView` / `toClientSteps` gate)
- `Session` / `Attempt` / `HintEvent` — this pivot reads them differently, doesn't replace them

**Changes:**
- Exercise intake is no longer "student pastes text, platform generates on the fly." It's "teacher creates an exercise once, students reach it by code."
- Session anonymity assumption (`PROJECT_SPEC.md` §9.1) is no longer "fully anonymous, no identity at all." Students still need no *account*, but they need a **lightweight, per-exercise identity** so a teacher's dashboard can tell them apart.

**Downgraded to optional:** the paraphrase-matching exercise cache (`step-plan-and-exercise-cache-addendum.md` §2 — embedding search, execution-verified auto-merge). It existed to control cost when many anonymous students might submit near-identical text. Under this model, a teacher creates an exercise once and every student reaches it by the same code — that's O(1) lookup, no fuzzy matching required. Keep the machinery, but repurpose it: **auto-merge becomes suggest-only** (Section 6.3), used to help a teacher avoid recreating an exercise that already exists — never to silently attach a teacher's published exercise to someone else's canonical record. Ownership makes silent merging a correctness problem, not just a cost optimization.

---

## 1. Roles

- **Teacher**: creates and owns exercises, gets a dashboard.
- **Student**: joins an exercise by code (or finds it via search, if the teacher made it public), works through it — no account required.

---

## 2. Data Model Additions

```python
class Teacher(BaseModel):
    id: str
    name: str
    email: str
    created_at: datetime

class Exercise(BaseModel):           # extends the existing Exercise/CanonicalExercise
    id: str
    teacher_id: str
    code: str                        # short, unique, shareable — e.g. "PY-7X2K"
    title: str
    visibility: Literal["code_only", "public_library"] = "code_only"
    created_via: Literal["manual", "upload", "llm_assisted"]
    reference_verified: bool         # true once Stage A verification confirms a working reference solution
    # ...existing fields unchanged: io_spec, concepts, steps: Step[], hidden_tests, languages
    created_at: datetime
    updated_at: datetime

class StudentIdentity(BaseModel):
    id: str
    exercise_id: str
    display_name: str
    join_token: str                  # opaque token stored client-side (cookie/localStorage), re-presented to resume
    created_at: datetime
```

Add a nullable `student_identity_id` to `Session` (keep it nullable — see Section 7 on whether to retain an identity-less practice mode). `Attempt` and `HintEvent` already key off `session_id`, so no change needed there; the dashboard joins through `Session`.

---

## 3. Teacher Flow

### 3.1 Three creation paths

1. **Manual** — a form that produces the same `Exercise` + `Step[]` objects already typed. Simplest to ship first; no LLM or file-parsing involved.
2. **Upload** — the two-file bundle (Section 5). Validated on import; if the teacher didn't attach a reference solution, the exercise publishes with `reference_verified: false` and a visible warning, rather than blocking publication — a teacher should be able to ship a quick exercise without an LLM in the loop, but the risk should be visible in the dashboard, not hidden.
3. **LLM-assisted** — teacher pastes the exercise text and requests generation. Runs the existing Stage A → Stage B pipeline exactly as built. **Difference from the old model:** the result is a **draft** the teacher reviews and edits before publishing, not something that auto-publishes.

### 3.2 Endpoints (illustrative — match to your existing route conventions)

```
POST /api/teacher/exercises              # manual create
POST /api/teacher/exercises/upload       # two-file bundle
POST /api/teacher/exercises/generate     # LLM-assisted → returns a draft for review
POST /api/teacher/exercises/:id/publish  # assigns the code, makes it joinable
GET  /api/teacher/exercises/:id/progress # dashboard data (Section 7)
```

### 3.3 Publish

On publish: generate the short `code` (collision-checked), set `created_via`, and — if a reference solution exists (uploaded or LLM-generated) — run it through the existing sandbox verification one more time before flipping `reference_verified: true`. An exercise can still publish without this (see 3.1.2), just flagged.

---

## 4. Student Flow

1. **Join**: enter a code (primary path) or, for `public_library` exercises, search by title/teacher name.
2. **Light identity**: a display name, paired with the code, creates a `StudentIdentity`; the `join_token` is stored client-side so returning to the same browser resumes the same identity without a full account. No password, no email required.
3. **Workspace**: identical to what's already built — steps, hints, sandbox, progressive disclosure. Nothing changes here.
4. **Progress**: `Session` now carries `student_identity_id`, which is all the dashboard needs.

---

## 5. Two-File Format

```
exercise.md              # human-authorable
---
title: ...
language: python
concepts: [loops, lists]
difficulty: 2
---
# Statement
...
## Examples
- input: ...
  output: ...
## Constraints
...

steps.json                # the existing Step[] type, serialized — no new schema
[
  { "id": "s1", "order": 1, "title": "...", "goal": "...",
    "check_type": "ast_check", "ast_check": { "must_contain": ["For"] } },
  { "id": "s2", "order": 2, "title": "...", "goal": "...",
    "check_type": "function_test",
    "function_test": { "function_name": "solve", "args": [3, [1,2,3]], "expected": 6 } }
]
```

Import validation: parse both files, validate `steps.json` against the existing `Step` schema, and if a `reference_solution` is attached (optional third file or a field in `exercise.md` frontmatter), re-run the Stage A/B verification checks from the addendum against it before allowing publish without the warning flag.

---

## 6. Privacy and the Exercise Cache

### 6.1 Default visibility

Exercises default to `code_only` — reachable only with the code, not searchable. A teacher opts a specific exercise into `public_library` to make it discoverable by title/teacher name. This mirrors how classroom-code tools generally work and avoids a stranger finding an in-progress assignment.

### 6.2 Search

Only `public_library` exercises are indexed for the search-by-name path. Code-based join bypasses search entirely (direct lookup).

### 6.3 Exercise cache, repurposed

During **LLM-assisted creation only**, run the existing candidate-matching pipeline (embedding ANN + execution-verified check against the candidate's own examples) as a **suggestion**, not an automatic merge: *"An exercise very similar to this already exists (by [teacher] / in your own library) — reuse it, or continue creating your own?"* The teacher decides. Never silently attach one teacher's published exercise to another's canonical record.

---

## 7. Teacher Dashboard

No new heavy infrastructure — this is queries over `Session` / `Attempt` / `HintEvent`, grouped by `student_identity_id` within one `exercise_id`:

- **Roster view**: display name, current step (highest step with a passing `Attempt`), last active time (`max(Attempt.created_at)`), hints used (`count(HintEvent)`).
- **Aggregate view**: per-step completion rate across the class, average hints used per step, and the step with the highest failure/stuck rate — the "62% of the class stalled on step 3" signal. A simple `GROUP BY step_id` query; defer a materialized view or rollup job until class sizes make live aggregation slow.

---

## 8. Open Decisions

- **Q1 — Keep the old anonymous flow?** Should a no-teacher "practice mode" (paste your own exercise, work through it, nothing saved or tracked) survive alongside the new model, or does this pivot fully replace it? Affects whether `Session.student_identity_id` stays nullable long-term.
- **Q2 — Teacher auth mechanism.** Magic-link email is the lowest-friction option for a Tunisia-context MVP (no password management); a full OAuth provider is more setup than this needs right now. Recommendation: magic link first, revisit if institutional SSO becomes a requirement.
- **Q3 — Student identity persistence.** Cookie/localStorage-only `join_token` (simplest, but lost if the student switches browser/device) vs. an optional lightweight account for cross-device continuity later. Recommendation: start cookie-only; a student re-entering the code with the same name on a new device can still show up as a *new* roster row for now — acceptable for MVP, revisit if it becomes a real complaint.

---

## 9. Build Order

1. Teacher auth + manual exercise creation + code generation (no LLM, no upload — smallest slice that proves the model end to end).
2. Student join-by-code, wired to the existing IDE/step/hint flow.
3. Minimal dashboard: roster + current step per student (a query, not new infra).
4. LLM-assisted creation with teacher review-before-publish (reuses Stage A/B as-is).
5. Two-file upload + validation + optional reference-solution verification.
6. Aggregate analytics (stuck-point %, avg hints/step, completion time).
7. Convert the exercise-cache matcher from auto-merge to suggest-only (Section 6.3).
8. Public library search (last — code-based join already covers the core classroom case).
