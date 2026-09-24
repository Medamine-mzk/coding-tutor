import { describe, it, expect } from "vitest";
import { isMilestoneCompleted, evaluateMilestones, nextSuggestedMilestone } from "@/lib/exercise/milestoneCheck";
import type { Milestone } from "@/lib/exercise/types";
import type { TestReport } from "@/lib/runners/LanguageRunner";

function mkMilestone(title: string, order = 1): Milestone {
  return { id: `ms_${order}`, exerciseId: "ex_1", order, title, successCriteria: "ok", hintSeeds: [] };
}

describe("isMilestoneCompleted", () => {
  it("detects Read the input via input()", () => {
    const m = mkMilestone("Lire les entrées");
    expect(isMilestoneCompleted(m, 'x = input()', null)).toBe(true);
    expect(isMilestoneCompleted(m, "x = 1", null)).toBe(false);
  });

  it("detects Loop over data via for/while", () => {
    const m = mkMilestone("Boucler sur les données");
    expect(isMilestoneCompleted(m, "for i in range(5): pass", null)).toBe(true);
    expect(isMilestoneCompleted(m, "print(1)", null)).toBe(false);
  });

  it("detects Display result via print or return", () => {
    const m = mkMilestone("Afficher le résultat");
    expect(isMilestoneCompleted(m, "print(result)", null)).toBe(true);
    expect(isMilestoneCompleted(m, "return result", null)).toBe(true);
    expect(isMilestoneCompleted(m, "x=1", null)).toBe(false);
  });

  it("detects Define function via def", () => {
    const m = mkMilestone("Définir la fonction");
    expect(isMilestoneCompleted(m, "def solve(a,b): return a+b", null)).toBe(true);
    expect(isMilestoneCompleted(m, "x=1", null)).toBe(false);
  });

  it("applies condition check via if", () => {
    const m = mkMilestone("Appliquer la condition");
    expect(isMilestoneCompleted(m, "if x>0: print(x)", null)).toBe(true);
  });

  it("edge case needs if + hidden passed", () => {
    const m = mkMilestone("Gérer le cas limite");
    const report: TestReport = {
      passed: 1,
      failed: 0,
      total: 1,
      results: [{ testId: "t_hid_zero", passed: true }],
    };
    expect(isMilestoneCompleted(m, "if n==0: print(0)", report)).toBe(true);
    expect(isMilestoneCompleted(m, "print(1)", report)).toBe(false);
  });

  it("fallback to all tests passed", () => {
    const m = mkMilestone("Unknown milestone title xyz");
    const report: TestReport = { passed: 2, failed: 0, total: 2, results: [] };
    expect(isMilestoneCompleted(m, "some code", report)).toBe(true);
  });
});

describe("evaluateMilestones", () => {
  it("returns statuses with completed flags", () => {
    const milestones = [mkMilestone("Lire les entrées", 1), mkMilestone("Boucler sur les données", 2), mkMilestone("Afficher le résultat", 3)];
    const code = "x = input()\nfor i in range(3): print(i)";
    const statuses = evaluateMilestones(milestones, code, null);
    expect(statuses.length).toBe(3);
    expect(statuses[0].completed).toBe(true); // input
    expect(statuses[1].completed).toBe(true); // for
    expect(statuses[2].completed).toBe(true); // print
  });

  it("handles empty milestones", () => {
    expect(evaluateMilestones([], "code", null)).toEqual([]);
  });
});

describe("nextSuggestedMilestone", () => {
  it("returns first incomplete", () => {
    const ms = [mkMilestone("Lire les entrées", 1), mkMilestone("Boucler", 2)];
    const statuses = [
      { milestone: ms[0], completed: true },
      { milestone: ms[1], completed: false },
    ];
    expect(nextSuggestedMilestone(statuses)?.title).toBe("Boucler");
  });

  it("returns null when all completed", () => {
    const ms = [mkMilestone("Lire", 1)];
    expect(nextSuggestedMilestone([{ milestone: ms[0], completed: true }])).toBeNull();
  });
});
