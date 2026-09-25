// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — CreateResult union has lowConfidence branch; tests use runtime shape
import { describe, it, expect, beforeEach } from "vitest";
import { verifyStepPlan, verifyStep } from "@/lib/exercise/stepVerification";
import type { Step } from "@/lib/exercise/stepPlan";
import { clearExerciseService, createOrReuseExercise } from "@/lib/exercise/exerciseService";
import { clearCache } from "@/lib/exercise/exerciseCache";

function fakeStep(overrides: Partial<Step> = {}): Step {
  return {
    id: "step_1",
    order: 1,
    title: "Read the input",
    goal: "Read the input correctly",
    check_type: "io_test",
    io_test: { stdin: ["2 3"], expected_stdout: "5" },
    function_test: null,
    ast_check: null,
    hint_seeds: { "0": [] },
    exerciseId: "ex_1",
    successCriteria: "Read",
    hintSeeds: [],
    ...overrides,
  };
}

describe("Step verification — addendum 1.3", () => {
  it("rejects step whose io_test does not match reference", async () => {
    const ref = `print("5")`;
    const badStep = fakeStep({ io_test: { stdin: ["2 3"], expected_stdout: "999" } });
    const res = await verifyStep(ref, badStep);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/expected/);
  });

  it("rejects step whose ast_check is not satisfied by reference", async () => {
    const ref = `x = 1\nprint(x)`;
    const step = fakeStep({ check_type: "ast_check", io_test: null, ast_check: { must_contain: ["For"] } });
    const res = await verifyStep(ref, step);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/must_contain/);
  });

  it("accepts correct io_test and function_test", async () => {
    const ref = `def add(a,b):\n    return a+b`;
    const io = fakeStep({ io_test: null, function_test: { function_name: "add", args: [2, 3], expected: 5 }, check_type: "function_test", ast_check: null });
    const res = await verifyStep(ref, io);
    expect(res.ok).toBe(true);
  });

  it("verifyStepPlan fails if any step fails — never publish unverified", async () => {
    const ref = `print("5")`;
    const good = fakeStep({ io_test: { stdin: ["2 3"], expected_stdout: "5" } });
    const bad = fakeStep({ id: "step_2", order: 2, io_test: { stdin: ["2 3"], expected_stdout: "999" } });
    const res = await verifyStepPlan(ref, [good, bad]);
    expect(res.ok).toBe(false);
    expect(res.failedStep?.id).toBe("step_2");
  });
});

describe("Exercise cache — execution-verified matching (addendum 2.3)", () => {
  beforeEach(() => {
    clearExerciseService();
    clearCache();
  });

  it("same exercise in fr/ar/en merges via execution check", async () => {
    const frText = "Écrire un programme qui lit deux entiers et affiche leur somme.\nEntrée: 2 3 → Sortie: 5";
    const arText = "اكتب برنامجا يقرأ عددين ويطبع مجموعهما.\nإدخال: 2 3 → إخراج: 5";
    const enText = "Write a program that reads two integers and prints their sum.\nInput: 2 3 -> Output: 5";

    const r1 = await createOrReuseExercise(frText, { uiLocale: "fr" });
    expect(r1.matchMethod).toBe("new");
    const r2 = await createOrReuseExercise(arText, { uiLocale: "ar" });
    expect(r2.matchMethod).toBe("execution_verified");
    expect(r2.canonical.id).toBe(r1.canonical.id);
    const r3 = await createOrReuseExercise(enText, { uiLocale: "en" });
    expect(r3.matchMethod).toBe("execution_verified");
    expect(r3.canonical.id).toBe(r1.canonical.id);
  });

  it("sum vs product — near-identical phrasing must NOT merge (embedding close but execution fails)", async () => {
    // Use different expected to force execution mismatch
    const sumText2 = "Calcule la somme.\nEntrée: 2 3 → Sortie: 5";
    const prodText2 = "Calcule le produit.\nEntrée: 2 3 → Sortie: 6";
    const r1 = await createOrReuseExercise(sumText2, { uiLocale: "fr" });
    expect(r1.matchMethod).toBe("new");
    const r2 = await createOrReuseExercise(prodText2, { uiLocale: "fr" });
    // Even though embeddings are close (both "Calcule ..."), execution check will run candidate's reference (sum) against new examples (2 3 -> 6)
    // Sum reference with 2 3 gives 5, not 6, so it should NOT merge
    expect(r2.matchMethod).toBe("new");
    expect(r2.canonical.id).not.toBe(r1.canonical.id);
  });

  it("same exercise, different example numbers must merge (execution is example-content-independent)", async () => {
    const text1 = "Somme de deux nombres.\nEntrée: 2 3 → Sortie: 5";
    const text2 = "Somme de deux nombres.\nEntrée: 10 20 → Sortie: 30";
    const r1 = await createOrReuseExercise(text1, { uiLocale: "fr" });
    const r2 = await createOrReuseExercise(text2, { uiLocale: "fr" });
    // Text differs, so exact hash misses, but embedding + execution should merge
    // The second's examples are 10 20 ->30, candidate's reference (sum) with 10 20 gives 30, so it should merge
    expect(r2.matchMethod).toBe("execution_verified");
    expect(r2.canonical.id).toBe(r1.canonical.id);
  });

  it("no stated examples → LLM judge path, never auto-merge, log low-confidence", async () => {
    const noExamples = "Écrire un programme qui trie une liste sans exemples fournis. Il doit juste trier.";
    const r = await createOrReuseExercise(noExamples, { uiLocale: "fr" });
    // Our stub has no examples, so it will go to lowConfidence path
    expect((r as { lowConfidence?: boolean }).lowConfidence).toBe(true);
  });

  it("neverCache flag prevents reuse", async () => {
    const text = `Exercice jamais caché unique ${Date.now()}.\nEntrée: 999 → Sortie: 999`;
    const r1 = await createOrReuseExercise(text, { uiLocale: "fr", neverCache: true });
    expect(r1.matchMethod).toBe("new");
    const r2 = await createOrReuseExercise(text, { uiLocale: "fr" });
    expect(r2.matchMethod).toBe("new");
  });
});

describe("Concurrency — in-flight lock (addendum 4)", () => {
  beforeEach(() => {
    clearExerciseService();
    clearCache();
  });

  it("two concurrent same new exercises share one generation", async () => {
    const text = `Concurrence test ${Date.now()}\nEntrée: 5 → Sortie: 10`;
    const p1 = createOrReuseExercise(text, { uiLocale: "fr" });
    const p2 = createOrReuseExercise(text, { uiLocale: "fr" });
    const [r1, r2] = await Promise.all([p1, p2]);
    // One should be new, the other should be exact_hash (in-flight hit)
    const methods = [r1.matchMethod, r2.matchMethod].sort();
    expect(methods).toContain("new");
    // The second should have hit the in-flight promise, not triggered duplicate generation
    // We check that they share the same canonical id
    const id1 = (r1 as { canonical?: { id: string } }).canonical?.id ?? (r1 as { exercise: { canonical_exercise_id: string } }).exercise.canonical_exercise_id;
    const id2 = (r2 as { canonical?: { id: string } }).canonical?.id ?? (r2 as { exercise: { canonical_exercise_id: string } }).exercise.canonical_exercise_id;
    expect(id1).toBe(id2);
  });
});

describe("Localization cache (addendum 2.4)", () => {
  beforeEach(() => {
    clearExerciseService();
  });

  it("duplicate in different language reuses canonical and caches translation without re-solving", async () => {
    const fr = "Somme.\nEntrée: 2 3 → Sortie: 5";
    const r1 = await createOrReuseExercise(fr, { uiLocale: "fr" });
    const ar = "مجموع.\nإدخال: 2 3 → إخراج: 5";
    const r2 = await createOrReuseExercise(ar, { uiLocale: "ar" });
    // Execution should merge (same sum logic)
    expect(r2.canonical.id).toBe(r1.canonical.id);
    expect(r2.canonical.languages["ar"]).toBeDefined();
    expect(r2.canonical.languages["fr"]).toBeDefined();
  });
});

describe("Progressive disclosure (addendum 1.4)", () => {
  beforeEach(() => {
    clearExerciseService();
    clearCache();
  });

  it("server blanks future steps' goal and check data — only current step is fully visible", async () => {
    const text = "Somme de deux nombres.\nEntrée: 2 3 → Sortie: 5\nCe programme doit lire deux entiers et afficher leur somme, en gérant les cas limites.";
    const r1 = await createOrReuseExercise(text, { uiLocale: "fr" });
    // new exercise always starts at step 1
    const ex = r1.exercise as unknown as { steps?: import("@/lib/exercise/stepPlan").Step[]; currentStepOrder?: number };
    expect(ex.steps).toBeDefined();
    expect(ex.steps!.length).toBeGreaterThanOrEqual(3);
    expect(ex.currentStepOrder).toBe(1);
    // titles are always visible
    for (const s of ex.steps!) expect(s.title.length).toBeGreaterThan(0);
    // current step (order 1) has goal and at least empty check fields populated (or hint_seeds)
    const first = ex.steps!.find((s) => s.order === 1)!;
    expect(first.goal.length).toBeGreaterThan(0);
    // future steps must be title-only — goal blank and checks null/empty
    const future = ex.steps!.filter((s) => s.order > 1);
    expect(future.length).toBeGreaterThan(0);
    for (const s of future) {
      expect(s.goal).toBe("");
      expect(s.io_test).toBeNull();
      expect(s.function_test).toBeNull();
      expect(s.ast_check).toBeNull();
      expect(s.hint_seeds).toEqual({});
      // successCriteria / hintSeeds also blanked
      expect(s.successCriteria).toBe("");
      expect(s.hintSeeds).toEqual([]);
    }
    // verify canonical still stores full plan server-side (not leaked to client but present in store)
    const full = r1.canonical.step_plan;
    expect(full.length).toBe(ex.steps!.length);
    const fullFuture = full.filter((s) => s.order > 1);
    // At least one future step in the full plan has a real goal/check that was blanked for the client
    expect(fullFuture.some((s) => s.goal.length > 0 || s.io_test || s.ast_check || s.function_test)).toBe(true);
  });

  it("advancing currentStepOrder reveals the next step's goal", async () => {
    const text = `Disclosure advance ${Date.now()}\nEntrée: 1 2 → Sortie: 3`;
    const r1 = await createOrReuseExercise(text, { uiLocale: "fr" });
    const id = r1.canonical.id;
    // Re-fetch same canonical with currentStepOrder=2 should reveal step 2
    const { getCanonicalExercise, toExerciseView } = await import("@/lib/exercise/exerciseService");
    const canon = getCanonicalExercise(id)!;
    const ex2 = toExerciseView(canon, "fr", 2) as unknown as { steps: import("@/lib/exercise/stepPlan").Step[] };
    const s1 = ex2.steps.find((s) => s.order === 1)!;
    const s2 = ex2.steps.find((s) => s.order === 2)!;
    const future = ex2.steps.filter((s) => s.order > 2);
    expect(s1.goal.length).toBeGreaterThan(0);
    expect(s2.goal.length).toBeGreaterThan(0);
    for (const s of future) expect(s.goal).toBe("");
  });
});
