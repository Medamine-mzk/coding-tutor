export type Locale = "fr" | "ar" | "en";

export type ExerciseSource = "typed" | "upload" | "library";

export type ExerciseExample = {
  input: string;
  output: string;
};

export type Concept =
  | "loops"
  | "conditionals"
  | "lists"
  | "functions"
  | "recursion"
  | "dictionaries"
  | "strings"
  | "math";

export type Milestone = {
  id: string;
  exerciseId: string;
  order: number;
  title: string;
  successCriteria: string; // internal — now typed as Step.check_type; kept for compat
  hintSeeds: string[]; // internal
};

// Re-export Step as Milestone alias for incremental migration; new code should import from stepPlan
export type { Step, StepPlan, LocalizedCopy, CanonicalExercise, ExerciseSubmission } from "./stepPlan";

export type TestCase = {
  id: string;
  input?: string;
  stdin?: string[];
  expected: string;
  kind: "stdout" | "call";
  fnCall?: string;
  hidden: boolean;
  category?: string;
};

export type Exercise = {
  id: string;
  ownerId?: string;
  canonical_exercise_id?: string | null; // addendum 3
  language: "python"; // MVP only python
  uiLocale: Locale;
  title: string;
  statement: string;
  ioSpec: string;
  constraints: string[];
  examples: ExerciseExample[];
  difficulty: 1 | 2 | 3 | 4 | 5;
  concepts: Concept[];
  source: ExerciseSource;
  milestones: Milestone[]; // legacy view; new code should read StepPlan / steps
  steps?: import("./stepPlan").Step[]; // redacted client view per addendum 1.4 — only current step has goal/check
  currentStepOrder?: number; // 1-indexed order of the step currently in progress
  step_plan_version?: number; // pinned per Session
  visibleTests: TestCase[];
  hiddenTests: TestCase[];
  hiddenTestsRef?: string;
  neverCache?: boolean; // Q1
};

export type ReferenceSolution = {
  exerciseId: string;
  code: string; // server-only, never sent to browser
};

export type Session = {
  id: string;
  userId?: string;
  exerciseId: string;
  canonicalExerciseId?: string | null;
  stepPlanVersion: number; // pinned at start
  currentStepOrder: number; // 1-indexed — which step is currently in progress (progressive disclosure, addendum 1.4)
  currentCode: string;
  status: "in_progress" | "completed" | "abandoned";
  startedAt: string;
  finishedAt?: string;
};

export type ParseRequest = {
  text: string;
  source?: ExerciseSource;
  uiLocale?: Locale;
};

export type ParseResponse =
  | { isExercise: true; exercise: Exercise }
  | { isExercise: false; clarification: string; detectedLanguage: Locale };
