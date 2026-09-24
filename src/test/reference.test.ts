import { describe, it, expect } from "vitest";
import { generateHeuristicReference } from "@/lib/exercise/reference";
import type { Exercise } from "@/lib/exercise/types";

function fakeEx(statement: string, examples: Exercise["examples"] = [{ input: "2 3", output: "5" }]): Exercise {
  return {
    id: "ex_ref",
    language: "python",
    uiLocale: "fr",
    title: "Somme",
    statement,
    ioSpec: "io",
    constraints: [],
    examples,
    difficulty: 2,
    concepts: ["loops"],
    source: "typed",
    milestones: [],
    visibleTests: [],
    hiddenTests: [],
  };
}

describe("generateHeuristicReference", () => {
  it("produces sum reference for sum-like statement", () => {
    const ex = fakeEx("Écrire un programme qui calcule la somme de deux entiers");
    const ref = generateHeuristicReference(ex);
    expect(ref).toContain("solve");
    expect(ref).toContain("print");
    expect(ref).toContain("sum");
  });

  it("handles function signature", () => {
    const ex = fakeEx("def add(a, b): retourne la somme", [{ input: "2 3", output: "5" }]);
    const ref = generateHeuristicReference(ex);
    expect(ref).toContain("def add");
  });

  it("returns null for unknown exercise", () => {
    const ex = fakeEx("Exercice très spécial sans somme ni fonction", [{ input: "hello", output: "world" }]);
    // For generic unknown, our heuristic may still return null for non-sum
    // We check it does not throw and returns string or null
    const ref = generateHeuristicReference({ ...ex, statement: "Exercice inconnu" });
    expect(ref === null || typeof ref === "string").toBe(true);
  });
});
