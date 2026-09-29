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
  | "arrays"
  | "functions"
  | "recursion"
  | "dictionaries"
  | "strings"
  | "math";

// Steps/milestones removed — hints are now comment-based (commentHints.ts)
export type { CanonicalExercise, ExerciseSubmission } from "./stepPlan";

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
  visibleTests: TestCase[];
  hiddenTests: TestCase[];
  hiddenTestsRef?: string;
  neverCache?: boolean; // Q1
};

export type ReferenceSolution = {
  exerciseId: string;
  code: string; // server-only, never sent to browser
};

export type RevealedHint = { pair: number; level: number };

export type Session = {
  id: string;
  userId?: string;
  exerciseId: string;
  canonicalExerciseId?: string | null;
  currentCode: string;
  status: "in_progress" | "completed" | "abandoned";
  startedAt: string;
  finishedAt?: string;
  // Comment-based hints: paires (commentaire/code) révélées, niveau 1-5 chacune.
  revealedHints?: RevealedHint[];
  // Teacher pivot: lightweight per-exercise identity, nullable to keep practice mode (addendum Q1)
  student_identity_id?: string | null;
  studentIdentityId?: string | null; // alias for convenience
};

export type ParseRequest = {
  text: string;
  source?: ExerciseSource;
  uiLocale?: Locale;
};

export type ParseResponse =
  | { isExercise: true; exercise: Exercise }
  | { isExercise: false; clarification: string; detectedLanguage: Locale };
