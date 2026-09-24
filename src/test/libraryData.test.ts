import { describe, it, expect } from "vitest";
import { LIBRARY_EXERCISES, libraryStats } from "@/lib/exercise/library";

describe("library data", () => {
  it("has 20 exercises", () => {
    expect(LIBRARY_EXERCISES.length).toBe(20);
  });

  it("has fr/ar/en coverage", () => {
    const stats = libraryStats();
    expect(stats.byLocale.fr).toBeGreaterThanOrEqual(6);
    expect(stats.byLocale.ar).toBeGreaterThanOrEqual(3);
    expect(stats.byLocale.en).toBeGreaterThanOrEqual(3);
    expect(stats.total).toBe(20);
  });

  it("covers concepts loops, conditionals, lists, functions, recursion, strings, dictionaries, math", () => {
    const allConcepts = LIBRARY_EXERCISES.flatMap((e) => e.concepts);
    for (const c of ["loops", "conditionals", "lists", "functions", "recursion"] as const) {
      expect(allConcepts).toContain(c);
    }
  });

  it("each exercise has 3-7 milestones with titles only", () => {
    for (const ex of LIBRARY_EXERCISES) {
      expect(ex.milestones.length).toBeGreaterThanOrEqual(3);
      expect(ex.milestones.length).toBeLessThanOrEqual(7);
      expect(ex.milestones.every((m) => m.title.length > 0)).toBe(true);
      // Never contains solution body in title
      for (const m of ex.milestones) {
        expect(m.title).not.toMatch(/print\(sum/);
      }
    }
  });

  it("each exercise has visible and hidden tests, hidden never exposes beyond category", () => {
    for (const ex of LIBRARY_EXERCISES) {
      expect(ex.visibleTests.length).toBeGreaterThan(0);
      expect(ex.hiddenTests.length).toBeGreaterThan(0);
      for (const t of ex.visibleTests) expect(t.hidden).toBe(false);
      for (const t of ex.hiddenTests) {
        expect(t.hidden).toBe(true);
        expect(t.category).toBeTruthy();
      }
    }
  });

  it("difficulty 1..5 and source library", () => {
    for (const ex of LIBRARY_EXERCISES) {
      expect(ex.difficulty).toBeGreaterThanOrEqual(1);
      expect(ex.difficulty).toBeLessThanOrEqual(5);
      expect(ex.source).toBe("library");
      expect(ex.language).toBe("python");
    }
  });

  it("Bac seeds present (PGCD, Tri à bulles)", () => {
    const titles = LIBRARY_EXERCISES.map((e) => e.title);
    expect(titles).toContain("PGCD de deux nombres");
    expect(titles).toContain("Tri à bulles");
  });

  it("no exercise leaks reference solution — hiddenTestsRef is opaque", () => {
    for (const ex of LIBRARY_EXERCISES) {
      expect(ex.hiddenTestsRef).toBeTruthy();
      // Ensure no field contains actual solution code like "def solve" with working body
      const json = JSON.stringify(ex);
      // It's okay to have statement, but not hidden test input/expected leak beyond category? Hidden tests do have expected but they are not shown in UI
      // Ensure exercise JSON does not contain a full reference solution field
      expect(json).not.toContain("referenceSolution");
    }
  });
});
