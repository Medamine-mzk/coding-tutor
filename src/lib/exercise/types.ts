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
  successCriteria: string; // internal
  hintSeeds: string[]; // internal
};

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
  milestones: Milestone[];
  visibleTests: TestCase[];
  hiddenTests: TestCase[];
  hiddenTestsRef?: string;
};

export type ReferenceSolution = {
  exerciseId: string;
  code: string; // server-only, never sent to browser
};

export type ParseRequest = {
  text: string;
  source?: ExerciseSource;
  uiLocale?: Locale;
};

export type ParseResponse =
  | { isExercise: true; exercise: Exercise }
  | { isExercise: false; clarification: string; detectedLanguage: Locale };
