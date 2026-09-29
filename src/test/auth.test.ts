import { describe, it, expect } from "vitest";
import { buildExerciseFromHeuristics, isExerciseLike } from "@/lib/exercise/parser";
import { generateSkeleton } from "@/lib/exercise/skeleton";
import { cannedFallback } from "@/lib/tutor/prompt";

const LOGIN_TEXT = "Ecrire un programme qui demande à l’utilisateur de saisir un login et un mot de passe (deux chaines de caractères). Le programme doit tester si les deux chaines sont égales à « admin » « admin » si c’est le cas on affiche un message de bienvenue sinon on affiche un message à l’utilisateur lui informant que le login et le mot de passe saisie sont incorrecte.";

describe("login exercise — auth", () => {
  it("isExerciseLike true even without Entrée/Sortie", () => {
    expect(isExerciseLike(LOGIN_TEXT)).toBe(true);
  });

  it("builds correct exercise via heuristics", () => {
    const ex = buildExerciseFromHeuristics(LOGIN_TEXT, "typed", "fr");
    expect(ex.title).toBe("Authentification login / mot de passe");
    expect(ex.ioSpec).toMatch(/login.*mot de passe/i);
    expect(ex.examples[0].input).toBe("admin\nadmin");
    expect(ex.examples[0].output).toBe("Bienvenue");
    expect(ex.concepts).toEqual(expect.arrayContaining(["conditionals", "strings"]));
  });

  it("detects conditionals concepts and examples for auth", () => {
    const ex = buildExerciseFromHeuristics(LOGIN_TEXT, "typed", "fr");
    expect(ex.concepts).toEqual(expect.arrayContaining(["conditionals"]));
    expect(ex.examples.length).toBeGreaterThan(0);
    expect(ex.visibleTests.length).toBeGreaterThan(0);
  });

  it("generates hidden tests for auth (correct, wrong, case, empty)", () => {
    const ex = buildExerciseFromHeuristics(LOGIN_TEXT, "typed", "fr");
    expect(ex.hiddenTests.length).toBe(4);
    expect(ex.hiddenTests[0].category).toMatch(/correct/i);
  });

  it("generates leak-free skeleton for auth (title only, no solution structure)", () => {
    const ex = buildExerciseFromHeuristics(LOGIN_TEXT, "typed", "fr");
    const skel = generateSkeleton(ex);
    expect(skel).toContain(ex.title);
    expect(skel).toContain("Écris ton code ici");
    expect(skel).not.toContain("input(");
    expect(skel).not.toContain("print(");
    expect(skel).not.toContain("if ");
    expect(skel).not.toContain("admin");
  });

  it("canned fallback contextual for auth (level 1 login)", () => {
    const ex = buildExerciseFromHeuristics(LOGIN_TEXT, "typed", "fr");
    const ctx = { exercise: ex, code: "", hintHistory: [], locale: "fr" as const, lastRunResult: null, testReport: null };
    expect(cannedFallback(1, "fr", ctx)).toMatch(/login|mot de passe|input/i);
  });
});
