import { describe, it, expect } from "vitest";
import { visibleTestsFromExamples, generateHiddenTests, functionCallTestsForExercise } from "@/lib/exercise/tests";
import type { Exercise } from "@/lib/exercise/types";

function exWith(concepts: Exercise["concepts"], examples: Exercise["examples"] = [{ input: "2 3", output: "5" }], statement = "Somme de deux nombres"): Exercise {
  return {
    id: "ex_1",
    language: "python",
    uiLocale: "fr",
    title: "Somme",
    statement,
    ioSpec: "io",
    constraints: ["-1000 ≤ n ≤ 1000"],
    examples,
    difficulty: 2,
    concepts,
    source: "typed",
    milestones: [],
    visibleTests: [],
    hiddenTests: [],
  };
}

describe("visibleTestsFromExamples", () => {
  it("creates up to 2 visible tests", () => {
    const ex = exWith(["loops"], [{ input: "2 3", output: "5" }, { input: "0 0", output: "0" }, { input: "1 1", output: "2" }]);
    const vis = visibleTestsFromExamples(ex);
    expect(vis.length).toBe(2);
    expect(vis[0].hidden).toBe(false);
    expect(vis[0].expected).toBe("5");
  });
});

describe("generateHiddenTests", () => {
  it("generates 3-4 hidden for sum-like loops exercise", () => {
    const ex = exWith(["loops"], [{ input: "2 3", output: "5" }], "Somme de deux nombres avec boucle");
    const hidden = generateHiddenTests(ex);
    expect(hidden.length).toBeGreaterThanOrEqual(2);
    expect(hidden.length).toBeLessThanOrEqual(4);
    expect(hidden.every((t) => t.hidden)).toBe(true);
    expect(hidden.every((t) => t.category && t.category.length > 0)).toBe(true);
  });

  it("includes edge categories for zero, negative, boundary", () => {
    const ex = exWith(["loops"], [{ input: "2 3", output: "5" }], "somme");
    const hidden = generateHiddenTests(ex);
    const cats = hidden.map((h) => h.category);
    expect(cats.some((c) => c?.includes("zero"))).toBe(true);
    expect(cats.some((c) => c?.includes("negative") || c?.includes("boundary"))).toBe(true);
  });

  it("never reveals hidden input/expected beyond category in UI sense — still has them server-side but flagged hidden", () => {
    const ex = exWith(["loops"]);
    const hidden = generateHiddenTests(ex);
    // Server side has input/expected, but UI must treat as hidden — flagged
    expect(hidden[0].hidden).toBe(true);
    // But they do have input/expected for server validation
    expect(hidden[0].input).toBeTruthy();
    expect(hidden[0].expected).toBeTruthy();
  });

  it("caps at 4", () => {
    const ex = exWith(["loops", "conditionals", "lists"]);
    const hidden = generateHiddenTests(ex);
    expect(hidden.length).toBeLessThanOrEqual(4);
  });
});

describe("functionCallTestsForExercise", () => {
  it("detects def signature and creates call test", () => {
    const ex = exWith(["functions"], [{ input: "2 3", output: "5" }], "def add(a, b): return a + b");
    const calls = functionCallTestsForExercise(ex);
    expect(calls.length).toBe(1);
    expect(calls[0].kind).toBe("call");
    expect(calls[0].fnCall).toContain("add");
  });

  it("returns empty when no function signature", () => {
    const ex = exWith(["loops"]);
    expect(functionCallTestsForExercise(ex).length).toBe(0);
  });
});
