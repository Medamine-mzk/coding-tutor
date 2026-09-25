import type { Exercise, Locale, TestCase } from "./types";
import type { Milestone } from "./types";

// Step replaces Milestone per addendum 1.2 — keep Milestone alias for compat
export type CheckType = "io_test" | "function_test" | "ast_check";

export type IOTest = {
  stdin: string[];
  expected_stdout: string;
};

export type FunctionTest = {
  function_name: string;
  args: unknown[];
  expected: unknown;
};

export type ASTCheck = {
  must_contain: string[]; // e.g. "For", "Call:len"
  must_not_contain?: string[];
};

export type Step = {
  id: string;
  order: number;
  title: string; // always visible
  goal: string; // shown only when step is current
  check_type: CheckType;
  io_test: IOTest | null;
  function_test: FunctionTest | null;
  ast_check: ASTCheck | null;
  hint_seeds: Record<string, string[]>; // internal, feeds hint ladder
  // legacy compat — previous Milestone fields
  exerciseId: string;
  successCriteria: string;
  hintSeeds: string[];
};

export type StepPlan = Step[];

// Keep Milestone as alias so existing imports keep working; new code should use Step
export type MilestoneCompat = Step;

export function stepToLegacyMilestone(step: Step): Milestone {
  return {
    id: step.id,
    exerciseId: step.exerciseId,
    order: step.order,
    title: step.title,
    successCriteria: step.successCriteria,
    hintSeeds: step.hintSeeds,
  };
}

// CanonicalExercise + ExerciseSubmission per addendum 2.4

export type LocalizedCopy = {
  title: string;
  statement_display: string;
  step_titles: string[];
  step_goals: string[];
};

export type CanonicalExercise = {
  id: string;
  example_signature: string; // hash of example set
  text_embedding: number[]; // multilingual, indexed
  concepts: string[];
  io_spec: string;
  languages: Record<string, LocalizedCopy>;
  reference_solution_ref: string; // internal
  reference_solution: string; // kept in same object for MVP stub; never exposed to client
  step_plan_version: number;
  step_plan: Step[];
  hidden_tests: TestCase[];
  visible_tests: TestCase[]; // for MVP, also store visible separately
  neverCache?: boolean; // Q1
  hit_count: number;
  created_at: string;
};

export type ExerciseSubmission = {
  id: string;
  canonical_exercise_id: string | null;
  raw_text: string;
  detected_language: string;
  match_method: "exact_hash" | "execution_verified" | "llm_judge_low_confidence" | "new";
  match_confidence: number;
  created_at: string;
};

export function milestoneToStep(m: Milestone, locale: Locale = "fr"): Step {
  // Heuristic mapping: previous milestones had no typed check, so we infer one
  // This keeps old library data usable without regeneration
  const lower = m.title.toLowerCase();
  let check_type: CheckType = "io_test";
  if (lower.includes("fonction") || lower.includes("function") || lower.includes("définir")) check_type = "ast_check";
  else if (lower.includes("initialiser") || lower.includes("boucler") || lower.includes("lire")) check_type = "ast_check";

  return {
    id: m.id,
    order: m.order,
    title: m.title,
    goal: m.title, // for legacy, goal == title
    check_type,
    io_test: null,
    function_test: null,
    ast_check: check_type === "ast_check" ? { must_contain: [], must_not_contain: [] } : null,
    hint_seeds: { "0": m.hintSeeds },
    exerciseId: m.exerciseId,
    successCriteria: m.successCriteria,
    hintSeeds: m.hintSeeds,
  };
}

export function exerciseMilestonesToSteps(exercise: Exercise): Step[] {
  return exercise.milestones.map((m) => milestoneToStep(m, exercise.uiLocale));
}

// Progressive disclosure per addendum 1.4: only current step's goal and check are sent in full.
// Future steps are title-only; past steps remain fully visible for review. This blanks
// the exact leak the hint-ladder redaction was built to prevent (devtools network tab).
export function toClientSteps(steps: Step[], currentOrder: number): Step[] {
  return steps.map((s) => {
    if (s.order <= currentOrder) return s;
    return {
      ...s,
      goal: "",
      io_test: null,
      function_test: null,
      ast_check: null,
      hint_seeds: {},
      successCriteria: "",
      hintSeeds: [],
    };
  });
}

export function redactStepsForClient(steps: Step[], currentOrder: number): Step[] {
  return toClientSteps(steps, currentOrder);
}
