import type { CanonicalExercise, LocalizedCopy, Step } from "./stepPlan";

export async function ensureLocalizedCopy(
  canonical: CanonicalExercise,
  targetLocale: string
): Promise<LocalizedCopy> {
  if (canonical.languages[targetLocale]) return canonical.languages[targetLocale];

  // Cheap path: for MVP, just copy and mark as translated — no re-solve.
  // In production this would be a single LLM translate call for display strings only.
  const sourceLocale = Object.keys(canonical.languages)[0];
  const source = canonical.languages[sourceLocale];
  if (!source) throw new Error("no source language");

  // Stub translation: just reuse titles/goals with a note; real impl would call LLM translate.
  const translated: LocalizedCopy = {
    title: source.title,
    statement_display: source.statement_display,
    step_titles: [...source.step_titles],
    step_goals: [...source.step_goals],
  };
  canonical.languages[targetLocale] = translated;
  return translated;
}

export function applyLocalizedCopyToSteps(steps: Step[], copy: LocalizedCopy): Step[] {
  return steps.map((s, i) => ({
    ...s,
    title: copy.step_titles[i] ?? s.title,
    goal: copy.step_goals[i] ?? s.goal,
  }));
}
