export type HintLevel = 0 | 1 | 2 | 3 | 4 | 5;

export type HintLevelName = "Clarify" | "Guiding question" | "Concept nudge" | "Targeted hint" | "Micro-example" | "Skeleton";

export const HINT_LEVEL_NAMES: Record<HintLevel, HintLevelName> = {
  0: "Clarify",
  1: "Guiding question",
  2: "Concept nudge",
  3: "Targeted hint",
  4: "Micro-example",
  5: "Skeleton",
};

export const HINT_LEVEL_DESCRIPTIONS: Record<HintLevel, string> = {
  0: "Ask the student to restate the problem, inputs, expected outputs.",
  1: "Ask a question that points to the next idea (e.g., 'What should happen if the list is empty?').",
  2: "Name the relevant concept or tool (e.g., 'Think about iterating with a for loop and an accumulator').",
  3: "Point to the location/kind of bug in their code without fixing it (e.g., 'The issue is in your loop condition, line 6').",
  4: "Show a different, tiny, analogous example (not the exercise solution).",
  5: "Provide structure with blanks (# TODO), function signature, and comments. Never the working body.",
};

export type TutorRole = "student" | "tutor";

export type TutorMessage = {
  id: string;
  role: TutorRole;
  content: string;
  hintLevel?: HintLevel;
  createdAt: string;
};

export type QuickAction = "stuck" | "explain_error" | "check_approach" | "hint";

export type RunResultForTutor = {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  timedOut?: boolean;
  error?: string;
};

export type TestReportForTutor = {
  passed: number;
  failed: number;
  total: number;
  results: Array<{ testId: string; passed: boolean; message?: string }>;
};

export type TutorContext = {
  exercise: {
    id: string;
    title: string;
    statement: string;
    ioSpec: string;
    constraints: string[];
    examples: Array<{ input: string; output: string }>;
    concepts: string[];
  };
  code: string;
  lastRunResult?: RunResultForTutor | null;
  testReport?: TestReportForTutor | null;
  hintHistory: Array<{ level: HintLevel; at: string }>;
  locale: "fr" | "ar" | "en";
};

export type ChatRequest = {
  sessionId?: string;
  exerciseId?: string;
  exercise?: TutorContext["exercise"];
  code?: string;
  lastRunResult?: RunResultForTutor | null;
  testReport?: TestReportForTutor | null;
  hintHistory?: Array<{ level: HintLevel; at: string }>;
  locale?: "fr" | "ar" | "en";
  studentMessage?: string;
  quickAction?: QuickAction;
  requestedHintLevel?: HintLevel;
  codeChangedSinceLastHint?: boolean;
  hasRunSinceLastHint?: boolean;
  // For anti-leak would-pass check
  tests?: Array<{ id: string; input?: string; stdin?: string[]; expected: string; kind: "stdout" | "call"; fnCall?: string; hidden: boolean; category?: string }>;
};

export type ChatResponseChunk = {
  delta: string;
  done: boolean;
  hintLevelUsed?: HintLevel;
};
