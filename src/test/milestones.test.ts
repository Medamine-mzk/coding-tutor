import { describe, it, expect } from "vitest";
import { generateMilestones } from "@/lib/exercise/milestones";
import type { Exercise } from "@/lib/exercise/types";

function fakeExercise(concepts: Exercise["concepts"], uiLocale: Exercise["uiLocale"] = "fr", statement = "dummy"): Exercise {
  return {
    id: "ex_test",
    language: "python",
    uiLocale,
    title: "Test",
    statement,
    ioSpec: "io",
    constraints: [],
    examples: [{ input: "2 3", output: "5" }],
    difficulty: 2,
    concepts,
    source: "typed",
    milestones: [],
    visibleTests: [],
    hiddenTests: [],
  };
}

describe("generateMilestones", () => {
  it("always 3 to 7 milestones", () => {
    const ex = fakeExercise(["loops"]);
    const ms = generateMilestones(ex);
    expect(ms.length).toBeGreaterThanOrEqual(3);
    expect(ms.length).toBeLessThanOrEqual(7);
    expect(ms.every((m) => m.title.length > 0)).toBe(true);
    expect(new Set(ms.map((m) => m.order)).size).toBe(ms.length);
  });

  it("produces more milestones for richer concepts", () => {
    const simple = generateMilestones(fakeExercise(["loops"]));
    const rich = generateMilestones(fakeExercise(["loops", "conditionals", "lists", "functions"]));
    expect(rich.length).toBeGreaterThanOrEqual(simple.length);
  });

  it("localizes titles for ar and en", () => {
    const fr = generateMilestones(fakeExercise(["loops"], "fr"));
    const ar = generateMilestones(fakeExercise(["loops"], "ar"));
    const en = generateMilestones(fakeExercise(["loops"], "en"));
    expect(fr[0].title).not.toBe(ar[0].title);
    expect(en[0].title).not.toBe(ar[0].title);
  });

  it("includes successCriteria and hintSeeds (internal, never sent as solution)", () => {
    const ms = generateMilestones(fakeExercise(["recursion"], "fr"));
    expect(ms[0].successCriteria.length).toBeGreaterThan(0);
    expect(ms[0].hintSeeds.length).toBeGreaterThan(0);
  });

  it("recursion adds base case and recursive step", () => {
    const ms = generateMilestones(fakeExercise(["recursion"]));
    const titles = ms.map((m) => m.title);
    expect(titles.some((t) => t.toLowerCase().includes("base") || t.toLowerCase().includes("récursif") || t.includes("Base"))).toBe(true);
  });
});
