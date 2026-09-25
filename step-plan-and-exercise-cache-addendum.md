# Addendum: Verified Step Plans + Exercise Caching

This addendum extends **`PROJECT_SPEC.md`** (Section 6.2 "Milestones" and Section 8 "Data Model") and **`integration-hint-pipeline-v2.md`** (Section 6 "Local Retrieval"). It does not replace either document — it makes the milestone system concrete and adds a caching layer in front of exercise generation. Where this file gives a schema that differs from the earlier ones, **this file wins**; update the earlier schemas to match it.

> Hand this to Claude Code alongside the other two files. Build order is in Section 5.

---

## 1. Verified Step Plan (replaces the "milestone" sketch)

### 1.1 Why generation must be two-stage

Asking the LLM to write the exercise's N-step plan directly is risky: it is implicitly solving the exercise while describing it, and it *will* sometimes get an edge case wrong (empty input, off-by-one, formatting). If a step's expected output is wrong, a student with correct code fails a step they shouldn't — worse than no hints at all.

**Stage A (hidden).** Ask the LLM to solve the exercise: produce a reference solution and a few test cases.
**Verify.** Run the reference solution in the sandbox against its own test cases. If any fail, regenerate Stage A (bounded retries) or route to instructor review. Nothing is shown to the student yet.
**Stage B.** Ask the LLM to decompose the **verified** solution into an N-step plan (3–7 steps, per the product spec's milestone guidance), using the confirmed input/output behavior. The reference solution itself never leaves the server, same rule as the hint engine.

```
raw exercise text
   → Stage 1 parse → structured Exercise (title, statement, io_spec, constraints, concepts, language)
   → Stage A: LLM proposes reference_solution + test_cases (hidden)
   → sandbox verifies reference_solution against test_cases
        fail → regenerate (≤2×) → still failing → flag for instructor review, do not publish
        pass → continue
   → Stage B: LLM decomposes verified solution into StepPlan (uses confirmed I/O, not guesses)
   → sandbox re-verifies each step's check against reference_solution (Section 1.3)
   → publish: student-safe Exercise + StepPlan; reference_solution stays internal
```

### 1.2 Step schema

Every step declares **how it is graded**, because "input → expected output" only works for whole-program steps. Intermediate steps (initialize a variable, start a loop) usually aren't independently runnable programs yet.

```python
class Step(BaseModel):
    id: str
    order: int
    title: str                         # shown to student always
    goal: str                          # shown only when this step is current
    check_type: Literal["io_test", "function_test", "ast_check"]
    io_test: IOTest | None             # stdin/stdout, for whole-program or final steps
    function_test: FunctionTest | None # call a named function directly with args, compare return value
    ast_check: ASTCheck | None         # e.g. must_contain: ["For", "Call:len"], must_not_contain: [...]
    hint_seeds: dict                   # internal only — feeds the hint ladder, never shown raw

class IOTest(BaseModel):
    stdin: list[str]
    expected_stdout: str

class FunctionTest(BaseModel):
    function_name: str
    args: list[Any]
    expected: Any

class ASTCheck(BaseModel):
    must_contain: list[str]            # AST node types or call names
    must_not_contain: list[str] = []
```

Guidance for which `check_type` to use:

| Step kind | check_type | Why |
|---|---|---|
| "Define the function / read input" | `ast_check` | Not independently testable by output yet |
| A sub-computation that maps to a helper function | `function_test` | Robust — no stdout formatting false-failures |
| The final, complete program | `io_test` | Matches the exercise's real examples + hidden tests |

`function_test` is preferred over `io_test` wherever the exercise's reference solution has a natural function boundary — it's immune to print-formatting mismatches that plague stdout comparison.

### 1.3 Step verification at generation time

Same principle as the exercise-level verification: run every step's check against the **reference solution** before publishing.
- `io_test` / `function_test`: execute the reference solution (or the relevant function) in the sandbox and confirm it actually produces `expected_stdout` / `expected`.
- `ast_check`: parse the reference solution and confirm the `must_contain` nodes are actually present (sanity check that the step's claim about the solution's structure is true).

If a step fails this check, treat it like Stage A verification failure: regenerate or flag for review. **A step plan is never published unpublished-unverified.**

### 1.4 Progressive disclosure and grading flow

- Only the **current step's** `goal` and check are sent to the client in full. Future steps show `title` only (per the product spec's existing rule) — showing every `expected_stdout` up front, even without literal code, still outlines the whole algorithm.
- On "Run": execute the student's current code in the sandbox, apply the current step's check.
  - **Pass** → mark step complete, advance, reveal next step's `goal`.
  - **Fail** → produce a `Diagnostic` (integration guide v2, Section 5.4) scoped to this step, and route it through the **existing hint ladder and state machine** (product spec Section 6.1; integration guide v2 Section 9) — do not build a second, separate hint mechanism for step failures. A step check is just a `Diagnostic` with a narrower scope.
- `Milestone` in the original data model (`PROJECT_SPEC.md` Section 8) is now exactly `Step` as defined here; `successCriteria` becomes the typed `check_type` + its test data, `hintSeeds` stays internal.

---

## 2. Exercise Caching (avoid regenerating the same exercise)

### 2.1 Why naive matching fails

- **Text embeddings alone are unsafe.** "Sum of a list", "product of a list", and "max of a list" are near-identical sentences and will embed very close together — but they are different problems. Merging on embedding similarity alone risks silently serving the wrong plan.
- **Cross-language matching needs a multilingual embedding model.** A French and an Arabic statement of the same exercise must be recognized as the same problem; an English-only embedding model won't do this. Use a multilingual sentence-embedding model (e.g. LaBSE, or a multilingual-E5/BGE-M3-style model) that covers fr/ar/en.

### 2.2 The disambiguator: verify candidates by execution, not by text

Every cached exercise already has a **verified reference solution** (Section 1.1). Use it to confirm — not just suggest — a match:

> For a candidate match, run the **candidate's stored reference solution** against the **new submission's own stated examples**. If it reproduces every stated expected output (with the usual comparison tolerance — whitespace, float tolerance, order-insensitive collections), that's near-certain proof it's the same problem, regardless of language or phrasing. If it doesn't, they're different problems even if the text looked nearly identical.

This single check solves both the false-positive trap (sum vs. product) and the cross-language problem, and it costs a function call, not an LLM call.

### 2.3 Matching pipeline

```
new submission → Stage 1 parse (title, io_spec, examples, concepts, language) → normalize text
  1. exact normalized-text hash hit?                    → reuse instantly, zero cost
  2. else: embedding ANN search (top-k) in the exercise vector index
       (reuse the SAME vector store as hint retrieval — a second collection, no new infra)
       for each candidate, best first:
         run candidate.reference_solution against every example the new submission states
         all match (within tolerance)?                  → MERGE: link to candidate's canonical exercise
  3. no candidate confirmed by execution:
       - new submission has stated examples but none matched → genuinely new exercise
       - new submission has NO examples to test against → low-signal case:
           one cheap LLM-judge call comparing structured summaries (title, io_spec, concepts)
           never auto-merge on this alone; log for periodic human spot-check either way
  4. confirmed new → run the full Stage A/B generation + verification (Section 1.1),
     store as a new CanonicalExercise with its embedding + examples for future matching
```

Bias conservative on purpose: only the exact-hash and execution-verified paths auto-merge. A wrong auto-merge (serving the wrong plan) is worse than an unnecessary regeneration.

### 2.4 Data model

```python
class CanonicalExercise(BaseModel):
    id: str
    example_signature: str              # normalized hash of the example set — fast pre-filter
    text_embedding: list[float]         # multilingual; indexed in the shared vector store
    concepts: list[str]
    io_spec: IOSpec
    languages: dict[str, LocalizedCopy] # {"fr": {...}, "ar": {...}, "en": {...}} — filled on demand
    reference_solution_ref: str         # internal only, never exposed to the client
    step_plan_version: int
    step_plan: list[Step]               # verified plan from Section 1
    hidden_tests: list[TestCase]
    hit_count: int
    created_at: datetime

class ExerciseSubmission(BaseModel):
    id: str
    canonical_exercise_id: str | None   # null until matched/created
    raw_text: str
    detected_language: str
    match_method: Literal["exact_hash", "execution_verified", "llm_judge_low_confidence", "new"]
    match_confidence: float
    created_at: datetime

class LocalizedCopy(BaseModel):
    title: str
    statement_display: str
    step_titles: list[str]
    step_goals: list[str]               # only translated, never re-solved
```

Notes:
- **Localization is cheap.** If a duplicate is found but the student's UI language differs from any cached `languages` entry, translate just the display strings and cache the result — never re-run Stage A/B for a language variant.
- **Versioning protects students mid-session.** If an instructor edits a published step plan, bump `step_plan_version`. A `Session` (per `PROJECT_SPEC.md` Section 8) records which version it started with; in-progress sessions keep grading against their original version.
- **Reused infrastructure.** The embedding index is a second collection in the same vector store already planned for hint retrieval (`integration-hint-pipeline-v2.md` Section 6); the execution check uses the same sandbox already used for grading and Stage A/B verification. No new infrastructure category.

### 2.5 Open product decision

Should exercise reuse be platform-wide by default, or should an instructor be able to mark an exercise "always regenerate / never cache" — e.g. to stop students comparing identical step plans with each other? Worth a boolean flag on exercise creation; not a blocker for building this.

---

## 3. Consolidated Data Model Changes to `PROJECT_SPEC.md`

Replace `PROJECT_SPEC.md` Section 8's `Milestone` with `Step` (Section 1.2 above). Add `CanonicalExercise` and `ExerciseSubmission` (Section 2.4). `Exercise` gains `canonical_exercise_id` (nullable, set once matched or created) so `Session` and `Attempt` continue to reference a session-local `Exercise` view while the heavy, verified content lives once in `CanonicalExercise`.

---

## 4. Testing Additions

- **Step verification tests**: seeded reference solutions with deliberately wrong step checks → generation pipeline must reject/flag, never publish.
- **Matching tests**: (a) same exercise, three languages → must merge via execution check; (b) "sum" vs "product" of a list, near-identical phrasing → must **not** merge; (c) same exercise, different example numbers → must merge (execution check is example-content-independent as long as the algorithm agrees); (d) exercise with no stated examples → must route to LLM-judge path and log low confidence, never silently auto-merge.
- **Concurrency**: two students submit the same new exercise at nearly the same time → second one should hit the cache once the first's generation completes, not trigger a duplicate generation (simple lock/in-flight map keyed by normalized-text hash is sufficient for MVP).

## 5. Build Order (insert into `PROJECT_SPEC.md` Section 12)

Insert between the existing steps 3 ("Exercise intake") and 4 ("Milestones + tests generation"):

1. Stage A/B generation pipeline with sandbox verification (Section 1.1, 1.3) — ships before caching.
2. Step schema + progressive disclosure + wiring step failures into the existing hint ladder (Section 1.4).
3. Exact-hash cache lookup only (fastest win, simplest to ship).
4. Embedding index + execution-verified matching (Section 2.3) — reuse the hint-retrieval vector store.
5. LLM-judge fallback path + low-confidence logging for the no-examples case.
6. Localization cache (`languages` map) so cached exercises serve fr/ar/en without regeneration.
