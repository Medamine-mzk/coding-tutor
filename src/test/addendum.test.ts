// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — CreateResult union has lowConfidence branch; tests use runtime shape
import { describe, it, expect, beforeEach } from "vitest";
import { clearExerciseService, createOrReuseExercise } from "@/lib/exercise/exerciseService";
import { clearCache } from "@/lib/exercise/exerciseCache";
import { addComments } from "@/lib/teacher/addComments";
import { parseCommentedReference, getHintText } from "@/lib/tutor/commentHints";

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

describe("Localization (addendum 2.4) — canonical reuse across languages", () => {
  beforeEach(() => {
    clearExerciseService();
  });

  it("duplicate in different language reuses canonical via execution check", async () => {
    const fr = "Somme.\nEntrée: 2 3 → Sortie: 5";
    const r1 = await createOrReuseExercise(fr, { uiLocale: "fr" });
    const ar = "مجموع.\nإدخال: 2 3 → إخراج: 5";
    const r2 = await createOrReuseExercise(ar, { uiLocale: "ar" });
    // Execution should merge (same sum logic) — no step titles to translate anymore
    expect(r2.canonical.id).toBe(r1.canonical.id);
    expect(r2.canonical.languages["fr"]).toBeDefined();
  });
});

describe("Comment-based hints — no steps, no progressive disclosure", () => {
  beforeEach(() => {
    clearExerciseService();
    clearCache();
  });

  it("generated exercise carries examples/tests but no steps", async () => {
    const text = "Somme de deux nombres.\nEntrée: 2 3 → Sortie: 5";
    const r1 = await createOrReuseExercise(text, { uiLocale: "fr" });
    const ex = r1.exercise as unknown as Record<string, unknown>;
    expect(ex["steps"]).toBeUndefined();
    expect(ex["currentStepOrder"]).toBeUndefined();
    expect((r1.exercise.examples?.length ?? 0)).toBeGreaterThan(0);
    expect((r1.exercise.visibleTests?.length ?? 0)).toBeGreaterThan(0);
  });

  it("reference → comments → 5-level progressive pairs", () => {
    const ref = "n = int(input())\ns = 0\nfor i in range(1, n + 1):\n    s = s + i\nprint(s)";
    const commented = addComments(ref);
    const pairs = parseCommentedReference(commented);
    expect(pairs.length).toBeGreaterThanOrEqual(5);
    // Level 1 = comment only (no code)
    const first = pairs[0];
    expect(getHintText(first, 1)).toContain("#");
    expect(getHintText(first, 1)).not.toContain("int(input())");
    // Level 5 = full line
    expect(getHintText(first, 5)).toContain(first.codeLine);
    // Levels are progressive (revealed content never shrinks — ▮ excluded)
    const stripped = (s: string) => s.replace(/▮/g, "");
    for (const p of pairs) {
      for (let lvl = 1; lvl < 5; lvl++) {
        expect(stripped(getHintText(p, lvl + 1)).length).toBeGreaterThanOrEqual(stripped(getHintText(p, lvl)).length);
      }
    }
  });
});
