import { createHash } from "node:crypto";
import { runPythonWithStdin } from "./runPython";
import type { CanonicalExercise, ExerciseSubmission, LocalizedCopy } from "./stepPlan";
import type { Exercise } from "./types";
import { LIBRARY_EXERCISES } from "./library";

// --- Helpers: normalization & example_signature ---

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents for hash stability
    .replace(/\s+/g, " ")
    .trim();
}

export function exampleSignature(examples: { input: string; output: string }[]): string {
  const norm = examples
    .map((e) => `${e.input.trim()}=>${e.output.trim()}`)
    .sort()
    .join("|");
  return createHash("sha256").update(norm).digest("hex").slice(0, 16);
}

export function canonicalTextHash(rawText: string): string {
  return createHash("sha256").update(normalizeText(rawText)).digest("hex");
}

// --- In-memory stub behind the same seam as the future vector store ---
// Q2: defer Qdrant/pgvector choice; keep an in-memory Map + example_signature pre-filter.
// The interface is intentionally the same shape the real embedding index will expose.

type ScoredCandidate = { exercise: CanonicalExercise; score: number };

class InMemoryEmbeddingIndex {
  private store: Map<string, CanonicalExercise> = new Map();
  // For the stub, "embedding" is just a bag-of-words hash; real model will be LaBSE/mE5.
  // We keep the type as number[] to match the schema, but the stub uses a trivial hash.
  private textToFakeEmbedding(text: string): number[] {
    // Cheap hash → 8-dim vector so the seam is typed correctly
    const h = createHash("sha256").update(normalizeText(text)).digest();
    return Array.from(h.subarray(0, 8)).map((b) => b / 255);
  }

  upsert(ex: CanonicalExercise) {
    this.store.set(ex.id, ex);
  }

  // Stub ANN: brute-force cosine on fake embeddings, plus example_signature pre-filter
  search(rawText: string, topK = 5): ScoredCandidate[] {
    const q = this.textToFakeEmbedding(rawText);
    const candidates: ScoredCandidate[] = [];
    for (const ex of this.store.values()) {
      if (ex.neverCache) continue;
      // Simple cosine similarity on 8-dim fake vectors
      const a = q;
      const b = ex.text_embedding;
      if (!b || b.length !== a.length) continue;
      let dot = 0, na = 0, nb = 0;
      for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
      }
      const sim = dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
      candidates.push({ exercise: ex, score: sim });
    }
    candidates.sort((x, y) => y.score - x.score);
    return candidates.slice(0, topK);
  }

  get(id: string): CanonicalExercise | undefined {
    return this.store.get(id);
  }

  all(): CanonicalExercise[] {
    return [...this.store.values()];
  }

  clear() {
    this.store.clear();
  }
}

// Singleton for the process — in production this would be a Qdrant/pgvector collection.
export const embeddingIndex = new InMemoryEmbeddingIndex();

// Seed from library so cross-language merges have candidates in tests without extra setup.
let seeded = false;
function ensureSeeded() {
  if (seeded) return;
  seeded = true;
  for (const ex of LIBRARY_EXERCISES.slice(0, 5)) {
    const fake: CanonicalExercise = {
      id: `canon_${ex.id}`,
      example_signature: exampleSignature(ex.examples),
      text_embedding: (embeddingIndex as unknown as { textToFakeEmbedding: (s: string) => number[] })["textToFakeEmbedding"](ex.statement),
      concepts: ex.concepts,
      io_spec: ex.ioSpec,
      constraints: ex.constraints,
      languages: {
        [ex.uiLocale]: { title: ex.title, statement_display: ex.statement },
      },
      reference_solution_ref: `ref_${ex.id}`,
      reference_solution: `print("ref for ${ex.id}")`,
      hidden_tests: ex.hiddenTests,
      visible_tests: ex.visibleTests,
      hit_count: 0,
      created_at: new Date().toISOString(),
    };
    embeddingIndex.upsert(fake);
  }
}
ensureSeeded();

// --- Execution-verified matching (addendum 2.2) ---

function compareOutputs(actual: string, expected: string): boolean {
  const a = actual.trim();
  const e = expected.trim();
  if (a === e) return true;
  // Float tolerance
  const af = parseFloat(a);
  const ef = parseFloat(e);
  if (!isNaN(af) && !isNaN(ef) && isFinite(af) && isFinite(ef)) {
    return Math.abs(af - ef) < 1e-6 * Math.max(1, Math.abs(ef));
  }
  // Whitespace-normalized
  if (a.replace(/\s+/g, " ") === e.replace(/\s+/g, " ")) return true;
  // Order-insensitive for space-separated collections
  const aParts = a.split(/\s+/).sort().join(" ");
  const eParts = e.split(/\s+/).sort().join(" ");
  if (aParts === eParts) return true;
  return false;
}

export async function executionVerifiedMatch(
  candidate: CanonicalExercise,
  newExamples: { input: string; output: string }[]
): Promise<boolean> {
  if (newExamples.length === 0) return false;
  const ref = candidate.reference_solution;
  for (const ex of newExamples) {
    const stdin = ex.input.split(/[ \n]+/).filter(Boolean);
    // Heuristic: if candidate looks like a function-based exercise, try function_test style first
    // For the cache check we just run the reference as a program with stdin → stdout
    const res = await runPythonWithStdin(ref, stdin, 1500);
    if (res.timedOut || res.exitCode !== 0) return false;
    if (!compareOutputs(res.stdout, ex.output)) return false;
  }
  return true;
}

// --- LLM-judge low-confidence path (stub) ---

export type LLMJudgeResult = { isSameProblem: boolean; confidence: number; reason: string };

// In production this would be a single cheap LLM call comparing structured summaries.
// For the stub we just return low-confidence unsure and let the caller log.
export async function llmJudgeSameProblem(
  _a: { title: string; io_spec: string; concepts: string[] },
  _b: { title: string; io_spec: string; concepts: string[] }
): Promise<LLMJudgeResult> {
  return { isSameProblem: false, confidence: 0.3, reason: "stub: no examples to verify, needs human" };
}

// --- In-flight lock for concurrency (addendum 4) ---

const inflight = new Map<string, Promise<CanonicalExercise>>();

export function getInflight(hash: string): Promise<CanonicalExercise> | undefined {
  return inflight.get(hash);
}

export function setInflight(hash: string, p: Promise<CanonicalExercise>) {
  inflight.set(hash, p);
  p.finally(() => inflight.delete(hash));
}

// For tests
export function clearInflight() {
  inflight.clear();
}
export function clearCache() {
  embeddingIndex.clear();
  clearInflight();
  seeded = false;
}

// --- Helpers for CanonicalExercise creation ---

export function toCanonicalExercise(
  exercise: Exercise,
  referenceSolution: string,
  opts: { neverCache?: boolean } = {}
): CanonicalExercise {
  const sig = exampleSignature(exercise.examples);
  const embedding = (embeddingIndex as unknown as { textToFakeEmbedding: (s: string) => number[] })["textToFakeEmbedding"](exercise.statement);
  const localized: LocalizedCopy = {
    title: exercise.title,
    statement_display: exercise.statement,
  };
  return {
    id: `canon_${exercise.id}`,
    example_signature: sig,
    text_embedding: embedding,
    concepts: exercise.concepts,
    io_spec: exercise.ioSpec,
    constraints: exercise.constraints,
    languages: { [exercise.uiLocale]: localized },
    reference_solution_ref: `ref_${exercise.id}`,
    reference_solution: referenceSolution,
    hidden_tests: exercise.hiddenTests,
    visible_tests: exercise.visibleTests,
    neverCache: opts.neverCache,
    hit_count: 0,
    created_at: new Date().toISOString(),
  };
}

export function recordHit(canonical: CanonicalExercise) {
  canonical.hit_count += 1;
  embeddingIndex.upsert(canonical);
}
