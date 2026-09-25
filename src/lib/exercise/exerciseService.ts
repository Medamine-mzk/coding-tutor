import { buildExerciseFromHeuristics } from "./parser";
import { generateReferenceSolutionLLM, generateHeuristicReference } from "./reference";
import { validateTestsWithReference } from "./validate";
import { generateStepPlan } from "./stepGenerator";
import { canonicalTextHash, exampleSignature, embeddingIndex, getInflight, setInflight, toCanonicalExercise, recordHit, executionVerifiedMatch, llmJudgeSameProblem, clearCache } from "./exerciseCache";
import { ensureLocalizedCopy } from "./localization";
import type { Exercise } from "./types";
import type { Step, CanonicalExercise } from "./stepPlan";
import { toClientSteps } from "./stepPlan";
import { parseExerciseWithLLMStrict } from "./llm";

export type CreateResult =
  | { fromCache: true; canonical: CanonicalExercise; exercise: Exercise; matchMethod: "exact_hash" | "execution_verified" }
  | { fromCache: false; canonical: CanonicalExercise; exercise: Exercise; matchMethod: "new" }
  | { fromCache: false; lowConfidence: true; exercise: Exercise }
  | { isExercise: false; clarification: string; detectedLanguage: string };

let lowConfidenceLog: Array<{ rawText: string; candidateId: string | null; reason: string; at: string }> = [];

export function getLowConfidenceLog() {
  return [...lowConfidenceLog];
}
export function clearLowConfidenceLog() {
  lowConfidenceLog = [];
}

// In-memory canonical store (for MVP, same process; production would be DB + vector store)
const canonicalStore = new Map<string, CanonicalExercise>();

function getCanonical(id: string): CanonicalExercise | undefined {
  return canonicalStore.get(id);
}

export function getCanonicalExercise(id: string): CanonicalExercise | undefined {
  return getCanonical(id);
}

export function listCanonicalExercises(): CanonicalExercise[] {
  return [...canonicalStore.values()];
}

export function clearExerciseService() {
  canonicalStore.clear();
  embeddingIndex.clear();
  clearCache();
  lowConfidenceLog = [];
}

// Main entry: create or reuse a verified CanonicalExercise for the raw text
export async function createOrReuseExercise(
  rawText: string,
  opts: { source?: Exercise["source"]; uiLocale?: string; neverCache?: boolean; currentStepOrder?: number } = {}
): Promise<CreateResult> {
  const normalizedHash = canonicalTextHash(rawText);
  const source = opts.source ?? "typed";

  // Strict 1-call parse (LLM) — single LLM call does isExercise + full structuring.
  // Manual heuristics are offline fallback only (no keys or LLM failure), as requested.
  // This makes "Continuer avec Python" robust to phrasing variants without hand-patched regex.
  let provisional: Exercise;
  {
    const strict = await parseExerciseWithLLMStrict({ text: rawText, source });
    if (!strict.isExercise) {
      const { detectLanguage } = await import("./parser");
      const lang = detectLanguage(rawText);
      const clarification =
        lang === "ar"
          ? "هذا لا يبدو كتمرين برمجة. الصق نص التمرين كاملا (البيان، المدخلات، المخرجات، الأمثلة)."
          : lang === "en"
            ? "This does not look like a programming exercise. Please paste the full statement (description, input/output, examples)."
            : "Ceci ne ressemble pas à un exercice de programmation. Colle l'énoncé complet (description, entrées/sorties, exemples).";
      return { isExercise: false as const, clarification, detectedLanguage: lang };
    }
    provisional = strict.exercise;
    // Respect uiLocale override if provided (e.g., from parse route's detectLanguage)
    if (opts.uiLocale) provisional.uiLocale = opts.uiLocale as never;
  }

  // Respect neverCache flag (Q1) — platform-wide cache default + per-exercise neverCache
  // For neverCache we bypass the in-flight lock entirely (each call generates fresh)
  if (opts.neverCache || provisional.neverCache) {
    return await generateNewCanonical(rawText, provisional, normalizedHash, "new", false, true);
  }

  // In-flight lock: if another request is generating the same normalized text, await it
  const inflight = getInflight(normalizedHash);
  if (inflight) {
    const canonical = await inflight;
    // If the inflight canonical is neverCache, don't reuse — fall through to fresh generation
    if (!canonical.neverCache) {
      const currentOrder = opts.currentStepOrder ?? 1;
      const exercise = toExerciseView(canonical, opts.uiLocale ?? Object.keys(canonical.languages)[0] as string, currentOrder);
      return { fromCache: true, canonical, exercise, matchMethod: "exact_hash" };
    }
  }

  // 1. Exact normalized-text hash hit (fastest)
  for (const canon of canonicalStore.values()) {
    if (canon.example_signature === exampleSignature(provisional.examples) && normalizeForHash(canon) === normalizedHash) {
      // Still need execution check? For exact hash we can reuse instantly per addendum
      if (canon.neverCache) continue;
      recordHit(canon);
      if (opts.uiLocale && !canon.languages[opts.uiLocale]) await ensureLocalizedCopy(canon, opts.uiLocale);
      const currentOrder = opts.currentStepOrder ?? 1;
      const exercise = toExerciseView(canon, opts.uiLocale, currentOrder);
      return { fromCache: true, canonical: canon, exercise, matchMethod: "exact_hash" };
    }
  }

  // 2. Embedding ANN search + execution-verified
  const candidates = embeddingIndex.search(rawText, 5);
  for (const { exercise: cand } of candidates) {
    const ok = await executionVerifiedMatch(cand, provisional.examples);
    if (ok) {
      if (cand.neverCache) continue;
      recordHit(cand);
      if (opts.uiLocale && !cand.languages[opts.uiLocale]) await ensureLocalizedCopy(cand, opts.uiLocale);
      const currentOrder = opts.currentStepOrder ?? 1;
      const exercise = toExerciseView(cand, opts.uiLocale, currentOrder);
      return { fromCache: true, canonical: cand, exercise, matchMethod: "execution_verified" };
    }
  }

  // 3. No candidate confirmed — also treat generic fallback "exemple entrée" as low-signal
  const isGenericExample = provisional.examples.length === 1 && provisional.examples[0].input === "exemple entrée";
  if (provisional.examples.length === 0 || isGenericExample) {
    const best = candidates[0]?.exercise;
    let judge: { isSameProblem: boolean; confidence: number; reason: string } | null = null;
    if (best) {
      judge = await llmJudgeSameProblem(
        { title: provisional.title, io_spec: provisional.ioSpec, concepts: provisional.concepts },
        { title: best.languages[Object.keys(best.languages)[0]]?.title ?? "", io_spec: best.io_spec, concepts: best.concepts }
      );
    }
    lowConfidenceLog.push({
      rawText: rawText.slice(0, 200),
      candidateId: best?.id ?? null,
      reason: judge?.reason ?? "no examples to verify, LLM judge would be needed",
      at: new Date().toISOString(),
    });
    return await generateNewCanonical(rawText, provisional, normalizedHash, "new", true);
  }

  // Genuinely new
  return await generateNewCanonical(rawText, provisional, normalizedHash, "new");
}

async function generateNewCanonical(
  rawText: string,
  provisional: Exercise,
  hash: string,
  _method: "new",
  isLowConfidence = false,
  neverCache = false
): Promise<CreateResult> {
  const promise = (async (): Promise<CanonicalExercise> => {
    // Stage A: reference + tests (already in provisional, but re-verify with sandbox)
    let reference = await generateReferenceSolutionLLM(provisional);
    if (!reference) reference = generateHeuristicReference(provisional) ?? `print("${provisional.examples[0]?.output ?? ""}")`;
    const allTests = [...provisional.visibleTests, ...provisional.hiddenTests];
    let kept = allTests;
    let attempts = 0;
    while (attempts < 3) {
      const validation = await validateTestsWithReference(kept, reference, { timeoutMs: 1500 });
      if (validation.kept.length === kept.length) break;
      // If some tests failed, discard them and retry with fewer tests; if still failing, regenerate reference
      kept = validation.kept;
      if (kept.length === 0) {
        // No tests survived → reference is wrong, regenerate
        const alt = await generateReferenceSolutionLLM({ ...provisional, visibleTests: kept, hiddenTests: [] });
        if (alt) reference = alt;
        kept = allTests;
      }
      attempts++;
      if (attempts >= 2 && kept.length === 0) break;
    }
    if (kept.length === 0) {
      throw new Error("Stage A verification failed: no tests survived; flag for instructor review");
    }

    // Stage B: StepPlan
    const steps = await generateStepPlan({ ...provisional, visibleTests: kept.filter((t) => !t.hidden), hiddenTests: kept.filter((t) => t.hidden) }, reference);

    const canonical = toCanonicalExercise({ ...provisional, visibleTests: kept.filter((t: import("./types").TestCase) => !t.hidden), hiddenTests: kept.filter((t: import("./types").TestCase) => t.hidden), milestones: steps.map((s: Step) => ({ id: s.id, exerciseId: s.exerciseId, order: s.order, title: s.title, successCriteria: s.successCriteria, hintSeeds: s.hintSeeds })) }, reference, { neverCache });
    canonical.step_plan = steps;
    canonical.hidden_tests = kept.filter((t: import("./types").TestCase) => t.hidden);
    canonical.visible_tests = kept.filter((t: import("./types").TestCase) => !t.hidden);
    // Ensure languages cache has the provisional locale
    if (!canonical.languages[provisional.uiLocale]) {
      canonical.languages[provisional.uiLocale] = {
        title: provisional.title,
        statement_display: provisional.statement,
        step_titles: steps.map((s) => s.title),
        step_goals: steps.map((s) => s.goal),
      };
    }
    canonicalStore.set(canonical.id, canonical);
    embeddingIndex.upsert(canonical);
    return canonical;
  })();

  setInflight(hash, promise);
  try {
    const canonical = await promise;
    const currentOrder = 1; // new exercise always starts at step 1
    if (isLowConfidence) {
      const exercise = toExerciseView(canonical, provisional.uiLocale, currentOrder);
      return { fromCache: false, lowConfidence: true as const, exercise };
    }
    const exercise = toExerciseView(canonical, provisional.uiLocale, currentOrder);
    return { fromCache: false, canonical, exercise, matchMethod: "new" as const };
  } catch (e) {
    // On verification failure, still return a provisional exercise but flag
    const exercise = provisional;
    (exercise as unknown as { _instructorReview?: boolean })._instructorReview = true;
    void toCanonicalExercise(exercise, "flagged", { neverCache });
    return { fromCache: false, lowConfidence: true as const, exercise } as unknown as CreateResult;
  }
}

function normalizeForHash(canon: CanonicalExercise): string {
  // For exact hash we use the first language's statement
  const firstLang = Object.keys(canon.languages)[0];
  const stmt = canon.languages[firstLang]?.statement_display ?? "";
  return canonicalTextHash(stmt);
}

export function toExerciseView(
  canonical: CanonicalExercise,
  uiLocale?: string,
  currentStepOrder: number = 1
): Exercise {
  const locale = (uiLocale ?? Object.keys(canonical.languages)[0] ?? "fr") as string;
  const copy = canonical.languages[locale] ?? canonical.languages[Object.keys(canonical.languages)[0]];
  // Legacy milestones (titles only, kept for compat) — still redacted via steps
  const milestones = canonical.step_plan.map((s: Step) => ({
    id: s.id,
    exerciseId: canonical.id,
    order: s.order,
    title: s.title,
    successCriteria: s.successCriteria,
    hintSeeds: s.hintSeeds,
  }));
  if (copy) {
    for (let i = 0; i < milestones.length; i++) {
      if (copy.step_titles[i]) milestones[i].title = copy.step_titles[i];
    }
  }
  // Progressive disclosure (addendum 1.4): only current step's goal and check leave the server.
  // Future steps are title-only — blank goal/check/hint_seeds server-side so devtools
  // network tab cannot reveal the whole plan. This is cheap and closes the exact leak
  // the hint-ladder / anti-leak layer was built to prevent.
  const localizedSteps: Step[] = canonical.step_plan.map((s, i) => {
    const localized = { ...s };
    if (copy?.step_titles[i]) localized.title = copy.step_titles[i];
    if (copy?.step_goals[i]) localized.goal = copy.step_goals[i];
    return localized;
  });
  const clientSteps = toClientSteps(localizedSteps, currentStepOrder);
  return {
    id: `ex_${canonical.id.slice(0, 8)}`,
    canonical_exercise_id: canonical.id,
    language: "python",
    uiLocale: locale as never,
    title: copy?.title ?? "Exercise",
    statement: copy?.statement_display ?? "",
    ioSpec: canonical.io_spec,
    constraints: [],
    examples: [...canonical.visible_tests.slice(0, 2).map((t) => ({ input: t.input ?? t.stdin?.join(" ") ?? "", output: t.expected }))],
    difficulty: 2,
    concepts: canonical.concepts as never,
    source: "typed",
    milestones,
    steps: clientSteps,
    currentStepOrder,
    step_plan_version: canonical.step_plan_version,
    visibleTests: canonical.visible_tests,
    hiddenTests: canonical.hidden_tests,
    hiddenTestsRef: `ref_${canonical.id}`,
  } as unknown as Exercise;
}

// Convenience for session-aware callers: advance disclosure when steps complete
export function toExerciseViewForSession(
  canonical: CanonicalExercise,
  session: { currentStepOrder: number; uiLocale?: string }
): Exercise {
  return toExerciseView(canonical, session.uiLocale, session.currentStepOrder);
}
