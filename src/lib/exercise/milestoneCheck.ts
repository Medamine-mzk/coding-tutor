import type { Milestone } from "./types";
import type { TestReport } from "@/lib/runners/LanguageRunner";

export type MilestoneStatus = {
  milestone: Milestone;
  completed: boolean;
  reason?: string;
};

function codeContains(code: string, pattern: RegExp): boolean {
  return pattern.test(code);
}

export function isMilestoneCompleted(
  milestone: Milestone,
  code: string,
  testReport: TestReport | null
): boolean {
  const title = milestone.title.toLowerCase();
  const lowCode = code.toLowerCase();

  // Generic display/return
  if (title.includes("afficher") || title.includes("display") || title.includes("إظهار") || title.includes("return")) {
    return /print\s*\(/.test(code) || /return/.test(code);
  }
  if (title.includes("lire") || title.includes("read") || title.includes("قراءة")) {
    return /input\s*\(/.test(code) || /sys\.stdin/.test(code);
  }
  if (title.includes("cas limite") || title.includes("edge") || title.includes("حدّية")) {
    // Needs if handling empty/zero
    const hasIf = /if\s/.test(code);
    // If tests include edge hidden and passed, consider completed
    if (testReport && testReport.total > 0) {
      const anyHiddenPassed = testReport.results.filter((r) => r.testId.startsWith("t_hid")).some((r) => r.passed);
      if (hasIf && anyHiddenPassed) return true;
      if (anyHiddenPassed && codeContains(code, /if/)) return true;
    }
    return /if\s.*(==\s*0|len\s*\(|empty)/i.test(code);
  }
  if (title.includes("initialiser") || title.includes("initialize") || title.includes("accumulateur") || title.includes("accumulator")) {
    return /=\s*0/.test(code) || /=\s*\[\]/.test(code) || /total\s*=\s*0/i.test(lowCode);
  }
  if (title.includes("boucler") || title.includes("loop") || title.includes("تكرار")) {
    return /\bfor\s/.test(code) || /\bwhile\s/.test(code);
  }
  if (title.includes("condition") || title.includes("appliquer") || title.includes("تطبيق")) {
    return /\bif\s/.test(code);
  }
  if (title.includes("collection") || title.includes("liste") || title.includes("list")) {
    return /\.append\s*\(|for\s.*in\s/.test(code);
  }
  if (title.includes("fonction") || title.includes("function") || title.includes("define")) {
    return /\bdef\s+\w+\s*\(/.test(code);
  }
  if (title.includes("base") || title.includes("cas de base")) {
    return /if\s.*==\s*0|if\s.*len.*==\s*0/.test(code);
  }
  if (title.includes("récursive") || title.includes("recursive")) {
    // Recursive step: function calls itself
    const fnMatch = code.match(/def\s+(\w+)\s*\(/);
    if (fnMatch) {
      const fn = fnMatch[1];
      const body = code.split(`def ${fn}`)[1] ?? "";
      return body.includes(`${fn}(`);
    }
    return false;
  }
  if (title.includes("calculer") || title.includes("logique") || title.includes("logic") || title.includes("تنفيذ")) {
    // Core logic: at least some computation beyond I/O
    return code.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).length > 3;
  }
  // Fallback: if all tests pass, consider completed
  if (testReport && testReport.passed === testReport.total && testReport.total > 0) return true;
  return false;
}

export function evaluateMilestones(milestones: Milestone[], code: string, testReport: TestReport | null): MilestoneStatus[] {
  return milestones.map((m) => ({
    milestone: m,
    completed: isMilestoneCompleted(m, code, testReport),
  }));
}

export function nextSuggestedMilestone(statuses: MilestoneStatus[]): Milestone | null {
  const next = statuses.find((s) => !s.completed);
  return next ? next.milestone : null;
}
