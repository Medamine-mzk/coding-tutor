import type { TestCase } from "./types";

// CanonicalExercise per addendum 2.4 — server-side record.
// Steps were removed: hints are now derived from the commented reference
// (commentHints.ts), revealed progressively via /api/student/hints.

export type LocalizedCopy = {
  title: string;
  statement_display: string;
};

export type CanonicalExercise = {
  id: string;
  example_signature: string; // hash of example set
  text_embedding: number[]; // multilingual, indexed
  concepts: string[];
  io_spec: string;
  constraints: string[];
  languages: Record<string, LocalizedCopy>;
  reference_solution_ref: string; // internal
  reference_solution: string; // kept in same object for MVP stub; never exposed to client
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
