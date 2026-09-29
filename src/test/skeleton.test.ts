import { describe, it, expect } from "vitest";
import { generateSkeleton } from "@/lib/exercise/skeleton";
import type { Exercise } from "@/lib/exercise/types";

function fakeEx(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: "ex_skel",
    language: "python",
    uiLocale: "fr",
    title: "Somme de 1 à n",
    statement: "Lire un entier n et afficher la somme 1+2+...+n.",
    ioSpec: "io",
    constraints: [],
    examples: [{ input: "5", output: "15" }],
    difficulty: 2,
    concepts: ["loops"],
    source: "typed",
    visibleTests: [],
    hiddenTests: [],
    ...overrides,
  };
}

const FORBIDDEN = ["input(", "print(", "for ", "while ", "if ", "import ", "return ", " = "];

describe("generateSkeleton — minimal anti-leak", () => {
  it("returns title + placeholder only, for any concepts", () => {
    for (const concepts of [
      ["loops"],
      ["recursion"],
      ["functions"],
      ["arrays"],
      ["conditionals"],
      ["loops", "conditionals"],
    ] as Array<Exercise["concepts"]>) {
      const skel = generateSkeleton(fakeEx({ concepts }));
      expect(skel).toContain("Somme de 1 à n");
      expect(skel).toContain("Écris ton code ici");
      for (const leak of FORBIDDEN) {
        expect(skel, `concepts ${concepts.join(",")} should not contain "${leak}"`).not.toContain(leak);
      }
    }
  });

  it("never reveals recursion structure (no solve, no base case, no I/O)", () => {
    const skel = generateSkeleton(
      fakeEx({ title: "Fibonacci recursif", concepts: ["recursion"], statement: "Définir fib(n) récursivement." })
    );
    expect(skel).not.toContain("def ");
    expect(skel).not.toContain("cas de base");
    expect(skel).not.toContain("appel récursif");
  });

  it("shows bare signature only when statement explicitly requires a function name", () => {
    const skel = generateSkeleton(
      fakeEx({ title: "Facto", concepts: ["recursion", "functions"], statement: "Écrire def factorielle(n) qui retourne n!." })
    );
    expect(skel).toContain("def factorielle(...):");
    expect(skel).not.toContain("return");
    expect(skel).not.toContain("for ");
  });
});
