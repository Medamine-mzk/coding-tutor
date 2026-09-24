import { describe, it, expect } from "vitest";
import { buildExerciseFromHeuristics, detectLanguage } from "@/lib/exercise/parser";
import { generateSkeleton } from "@/lib/exercise/skeleton";
import { generateMilestones } from "@/lib/exercise/milestones";
import { generateHiddenTests } from "@/lib/exercise/tests";
import { generateHeuristicReference } from "@/lib/exercise/reference";
import { cannedFallback } from "@/lib/tutor/prompt";

const VITESSE_TEXT = "Ecrire un programme qui demande à l’utilisateur de saisir une distance (en kilomètre) et le temps (minute) nécessaire pour la parcourir ; votre programme doit calculer la vitesse (en mètre par seconde). Pour rappelle la vitesse= distance/temps";

describe("vitesse exercise — ex_h308z92 regression", () => {
  it("detects language as fr", () => {
    expect(detectLanguage(VITESSE_TEXT)).toBe("fr");
  });

  it("builds correct exercise via heuristics (title, ioSpec, examples, concepts)", () => {
    const ex = buildExerciseFromHeuristics(VITESSE_TEXT, "typed", "fr");
    expect(ex.title).toBe("Calcul de la vitesse (distance/temps)");
    expect(ex.statement).toBe(VITESSE_TEXT);
    expect(ex.ioSpec).toMatch(/distance.*km.*temps.*minutes.*vitesse.*m\/s/i);
    expect(ex.examples[0].input).toBe("1\n1");
    expect(ex.examples[0].output).toBe("16.67");
    expect(ex.concepts).toEqual(["math"]);
    expect(ex.difficulty).toBe(2);
  });

  it("generates 6 milestones for vitesse (including conversion and division by zero)", () => {
    const ex = buildExerciseFromHeuristics(VITESSE_TEXT, "typed", "fr");
    const ms = generateMilestones(ex);
    expect(ms.length).toBe(6);
    const titles = ms.map((m) => m.title);
    expect(titles).toContain("Convertir les unités");
    expect(titles).toContain("Calculer la vitesse");
    expect(titles).toContain("Gérer la division par zéro");
  });

  it("generates hidden tests for vitesse (zero, division by zero, 1km1min, normal)", () => {
    const ex = buildExerciseFromHeuristics(VITESSE_TEXT, "typed", "fr");
    const hidden = generateHiddenTests(ex);
    expect(hidden.length).toBe(4);
    expect(hidden[0].category).toMatch(/zero distance/i);
    expect(hidden[1].category).toMatch(/division by zero/i);
  });

  it("generates minimal skeleton for vitesse (not sum)", () => {
    const ex = buildExerciseFromHeuristics(VITESSE_TEXT, "typed", "fr");
    const skel = generateSkeleton(ex);
    expect(skel).toContain("distance_km");
    expect(skel).toContain("temps_min");
    expect(skel).toContain("TODO: convertir");
    expect(skel).not.toContain("a = int(input(\"a: \"))");
  });

  it("heuristic reference for vitesse handles conversion and division by zero", () => {
    const ex = buildExerciseFromHeuristics(VITESSE_TEXT, "typed", "fr");
    const ref = generateHeuristicReference(ex);
    expect(ref).toContain("distance_km");
    expect(ref).toContain("temps_min");
    expect(ref).toContain("1000");
    expect(ref).toContain("60");
  });

  it("canned fallback is contextual for vitesse (level 1 conversion, level 2 hint)", () => {
    const ex = buildExerciseFromHeuristics(VITESSE_TEXT, "typed", "fr");
    const ctx = {
      exercise: ex,
      code: "",
      hintHistory: [],
      locale: "fr" as const,
      lastRunResult: null,
      testReport: null,
    };
    expect(cannedFallback(1, "fr", ctx)).toMatch(/1 km en mètres|1 minute en secondes/i);
    expect(cannedFallback(2, "fr", ctx)).toMatch(/distance_m.*1000|temps_s.*60/i);
  });

  it("canned fallback pinpoints syntax error line 4 with missing operator", () => {
    const ex = buildExerciseFromHeuristics(VITESSE_TEXT, "typed", "fr");
    const ctx = {
      exercise: ex,
      code: 'a = int(input("a: "))\nb = int(input("b: "))\nprint(a ( b)',
      hintHistory: [],
      locale: "fr" as const,
      lastRunResult: { stderr: "SyntaxError: '(' was never closed\n  File \"<exec>\", line 4\n    print(a ( b)\n         ^\nSyntaxError: '(' was never closed", exitCode: 1 },
      testReport: null,
    };
    const hint = cannedFallback(2, "fr", ctx);
    expect(hint).toMatch(/ligne 4/i);
    expect(hint).toMatch(/opérateur.*\+.*-.*\*.*\//i);
  });
});
