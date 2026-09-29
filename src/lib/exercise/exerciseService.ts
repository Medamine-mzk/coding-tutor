import { buildExerciseFromHeuristics } from "./parser";
import { generateReferenceSolutionLLM, generateHeuristicReference } from "./reference";
import { validateTestsWithReference } from "./validate";
import { canonicalTextHash, exampleSignature, embeddingIndex, getInflight, setInflight, toCanonicalExercise, recordHit, executionVerifiedMatch, llmJudgeSameProblem, clearCache } from "./exerciseCache";
import type { Exercise } from "./types";
import type { CanonicalExercise } from "./stepPlan";
import { parseExerciseWithLLMStrict } from "./llm";

export type ProgressEvent = {
  stage: "parse" | "reference" | "cache" | "done";
  status: "start" | "done";
  progress: number;
  mode?: "llm" | "heuristic" | "cache";
  provider?: string;
  label?: string;
};

export type ExerciseMeta = {
  parseMode: "llm" | "heuristic" | "cache";
  referenceMode?: "llm" | "heuristic" | "cache";
  provider?: string;
  matchMethod?: "exact_hash" | "execution_verified" | "new" | "lowConfidence";
  timings?: { parseMs?: number; referenceMs?: number; totalMs?: number };
};

export type CreateResult =
  | { fromCache: true; canonical: CanonicalExercise; exercise: Exercise; matchMethod: "exact_hash" | "execution_verified"; meta: ExerciseMeta }
  | { fromCache: false; canonical: CanonicalExercise; exercise: Exercise; matchMethod: "new"; meta: ExerciseMeta }
  | { fromCache: false; lowConfidence: true; exercise: Exercise; meta: ExerciseMeta }
  | { isExercise: false; clarification: string; detectedLanguage: string; meta?: ExerciseMeta };

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
  opts: { source?: Exercise["source"]; uiLocale?: string; neverCache?: boolean; onProgress?: (ev: ProgressEvent) => void } = {}
): Promise<CreateResult> {
  const normalizedHash = canonicalTextHash(rawText);
  const source = opts.source ?? "typed";

  // Strict 1-call parse (LLM) — single LLM call does isExercise + full structuring.
  // Manual heuristics are offline fallback only (no keys or LLM failure), as requested.
  // This makes "Continuer avec Python" robust to phrasing variants without hand-patched regex.
  const t0 = Date.now();
  opts.onProgress?.({ stage: "parse", status: "start", progress: 5, label: "Analyse de l'énoncé" });
  let provisional: Exercise;
  let parseMode: ExerciseMeta["parseMode"] = "heuristic";
  let parseProvider: string | undefined;
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
      opts.onProgress?.({ stage: "parse", status: "done", progress: 30, mode: strict.meta?.parseMode ?? "heuristic", provider: (strict as { meta?: { provider?: string } }).meta?.provider, label: "Analyse terminée" });
      return { isExercise: false as const, clarification, detectedLanguage: lang, meta: { parseMode: strict.meta?.parseMode ?? "heuristic", provider: (strict as { meta?: { provider?: string } }).meta?.provider } as ExerciseMeta };
    }
    provisional = strict.exercise;
    parseMode = strict.meta.parseMode;
    parseProvider = strict.meta.provider;
    opts.onProgress?.({ stage: "parse", status: "done", progress: 30, mode: parseMode, provider: parseProvider, label: parseMode === "llm" ? "Énoncé compris (LLM)" : "Énoncé compris (local)" });
    // Respect uiLocale override if provided (e.g., from parse route's detectLanguage)
    if (opts.uiLocale) provisional.uiLocale = opts.uiLocale as never;
  }

  // Respect neverCache flag (Q1) — platform-wide cache default + per-exercise neverCache
  // For neverCache we bypass the in-flight lock entirely (each call generates fresh)
  if (opts.neverCache || provisional.neverCache) {
    return await generateNewCanonical(rawText, provisional, normalizedHash, "new", false, true, { parseMode, parseProvider, onProgress: opts.onProgress, t0 });
  }

  // In-flight lock: if another request is generating the same normalized text, await it
  const inflight = getInflight(normalizedHash);
  if (inflight) {
    const canonical = await inflight;
    // If the inflight canonical is neverCache, don't reuse — fall through to fresh generation
    if (!canonical.neverCache) {
      const exercise = toExerciseView(canonical, opts.uiLocale ?? Object.keys(canonical.languages)[0] as string);
      opts.onProgress?.({ stage: "cache", status: "done", progress: 100, mode: "cache", label: "Cache — réutilisé" });
      return { fromCache: true, canonical, exercise, matchMethod: "exact_hash", meta: { parseMode: "cache", referenceMode: "cache", provider: "cache", matchMethod: "exact_hash", timings: { totalMs: Date.now() - t0 } } };
    }
  }

  // 1. Exact normalized-text hash hit (fastest)
  for (const canon of canonicalStore.values()) {
    if (canon.example_signature === exampleSignature(provisional.examples) && normalizeForHash(canon) === normalizedHash) {
      // Still need execution check? For exact hash we can reuse instantly per addendum
      if (canon.neverCache) continue;
      recordHit(canon);
      const exercise = toExerciseView(canon, opts.uiLocale);
      opts.onProgress?.({ stage: "cache", status: "done", progress: 100, mode: "cache", label: "Cache — exact" });
      return { fromCache: true, canonical: canon, exercise, matchMethod: "exact_hash", meta: { parseMode: "cache", referenceMode: "cache", provider: "cache", matchMethod: "exact_hash", timings: { totalMs: Date.now() - t0 } } };
    }
  }

  // 2. Embedding ANN search + execution-verified
  const candidates = embeddingIndex.search(rawText, 5);
  for (const { exercise: cand } of candidates) {
    const ok = await executionVerifiedMatch(cand, provisional.examples);
    if (ok) {
      if (cand.neverCache) continue;
      recordHit(cand);
      const exercise = toExerciseView(cand, opts.uiLocale);
      opts.onProgress?.({ stage: "cache", status: "done", progress: 100, mode: "cache", label: "Cache — vérifié" });
      return { fromCache: true, canonical: cand, exercise, matchMethod: "execution_verified", meta: { parseMode: "cache", referenceMode: "cache", provider: "cache", matchMethod: "execution_verified", timings: { totalMs: Date.now() - t0 } } };
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
    return await generateNewCanonical(rawText, provisional, normalizedHash, "new", true, false, { parseMode, parseProvider, onProgress: opts.onProgress, t0 });
  }

  // Genuinely new
  return await generateNewCanonical(rawText, provisional, normalizedHash, "new", false, false, { parseMode, parseProvider, onProgress: opts.onProgress, t0 });
}

async function generateNewCanonical(
  rawText: string,
  provisional: Exercise,
  hash: string,
  _method: "new",
  isLowConfidence = false,
  neverCache = false,
  extra: { parseMode?: ExerciseMeta["parseMode"]; parseProvider?: string; onProgress?: (ev: ProgressEvent) => void; t0?: number } = {}
): Promise<CreateResult> {
  const tRefStart = Date.now();
  let referenceMeta: { mode: "llm" | "heuristic"; provider?: string } = { mode: "heuristic" };
  extra.onProgress?.({ stage: "reference", status: "start", progress: 35, label: "Génération de la solution" });
  const promise = (async (): Promise<CanonicalExercise> => {
    // Stage A: reference + tests (already in provisional, but re-verify with sandbox)
    // Hints are derived later from the commented reference (commentHints.ts) — no step plan.
    const { generateReferenceSolutionWithMeta } = await import("./reference");
    const refRes = await generateReferenceSolutionWithMeta(provisional);
    let reference = refRes.code;
    referenceMeta = refRes.meta;
    if (!reference) {
      reference = generateHeuristicReference(provisional) ?? `print("${provisional.examples[0]?.output ?? ""}")`;
      referenceMeta = { mode: "heuristic" };
    }
    extra.onProgress?.({ stage: "reference", status: "done", progress: 80, mode: referenceMeta.mode, provider: referenceMeta.provider, label: referenceMeta.mode === "llm" ? "Solution générée (LLM)" : "Solution générée (local)" });
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
        const altRes = await generateReferenceSolutionWithMeta({ ...provisional, visibleTests: kept, hiddenTests: [] });
        if (altRes.code) {
          reference = altRes.code;
          // keep original referenceMeta for now, but could update
        }
        kept = allTests;
      }
      attempts++;
      if (attempts >= 2 && kept.length === 0) break;
    }
    if (kept.length === 0) {
      throw new Error("Stage A verification failed: no tests survived; flag for instructor review");
    }

    const canonical = toCanonicalExercise({ ...provisional, visibleTests: kept.filter((t: import("./types").TestCase) => !t.hidden), hiddenTests: kept.filter((t: import("./types").TestCase) => t.hidden) }, reference, { neverCache });
    canonical.hidden_tests = kept.filter((t: import("./types").TestCase) => t.hidden);
    canonical.visible_tests = kept.filter((t: import("./types").TestCase) => !t.hidden);
    canonicalStore.set(canonical.id, canonical);
    embeddingIndex.upsert(canonical);
    return canonical;
  })();

  setInflight(hash, promise as unknown as Promise<CanonicalExercise>);
  try {
    const canonical = await promise;
    const totalMs = extra.t0 ? Date.now() - extra.t0 : Date.now() - tRefStart;
    const referenceMs = totalMs;
    extra.onProgress?.({ stage: "done", status: "done", progress: 100, label: "Terminé" });
    const meta: ExerciseMeta = {
      parseMode: extra.parseMode ?? "heuristic",
      referenceMode: referenceMeta.mode,
      provider: extra.parseProvider ?? referenceMeta.provider,
      matchMethod: isLowConfidence ? "lowConfidence" as unknown as ExerciseMeta["matchMethod"] : "new",
      timings: { parseMs: extra.t0 ? tRefStart - extra.t0 : undefined, referenceMs, totalMs },
    };
    if (isLowConfidence) {
      const exercise = toExerciseView(canonical, provisional.uiLocale);
      return { fromCache: false, lowConfidence: true as const, exercise, meta };
    }
    const exercise = toExerciseView(canonical, provisional.uiLocale);
    return { fromCache: false, canonical, exercise, matchMethod: "new" as const, meta };
  } catch (e) {
    // On verification failure, still return a provisional exercise but flag
    const exercise = provisional;
    (exercise as unknown as { _instructorReview?: boolean })._instructorReview = true;
    void toCanonicalExercise(exercise, "flagged", { neverCache });
    return { fromCache: false, lowConfidence: true as const, exercise, meta: { parseMode: extra.parseMode ?? "heuristic", referenceMode: "heuristic", provider: extra.parseProvider, matchMethod: "lowConfidence" as unknown as ExerciseMeta["matchMethod"] } } as unknown as CreateResult;
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
  uiLocale?: string
): Exercise {
  const locale = (uiLocale ?? Object.keys(canonical.languages)[0] ?? "fr") as string;
  const copy = canonical.languages[locale] ?? canonical.languages[Object.keys(canonical.languages)[0]];
  return {
    id: `ex_${canonical.id.slice(0, 8)}`,
    canonical_exercise_id: canonical.id,
    language: "python",
    uiLocale: locale as never,
    title: copy?.title ?? "Exercise",
    statement: copy?.statement_display ?? "",
    ioSpec: canonical.io_spec,
    constraints: canonical.constraints ?? [],
    examples: [...canonical.visible_tests.slice(0, 2).map((t) => ({ input: t.input ?? t.stdin?.join(" ") ?? "", output: t.expected }))],
    difficulty: 2,
    concepts: canonical.concepts as never,
    source: "typed",
    visibleTests: canonical.visible_tests,
    hiddenTests: canonical.hidden_tests,
    hiddenTestsRef: `ref_${canonical.id}`,
  } as unknown as Exercise;
}
