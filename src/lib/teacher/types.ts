export type Teacher = {
  id: string;
  name: string;
  email: string;
  created_at: string;
};

export type TeacherSession = {
  id: string;
  teacherId: string;
  token: string;
  created_at: string;
  expires_at: string;
};

export type TeacherExercise = {
  id: string;
  teacher_id: string;
  code: string; // e.g. "PY-7X2K"
  title: string;
  statement: string;
  language: "python";
  concepts: string[];
  difficulty: 1 | 2 | 3 | 4 | 5;
  io_spec: string;
  constraints: string[];
  examples: Array<{ input: string; output: string }>;
  hidden_tests: import("../exercise/types").TestCase[];
  visible_tests: import("../exercise/types").TestCase[];
  visibility: "code_only" | "public_library";
  created_via: "manual" | "upload" | "llm_assisted";
  reference_verified: boolean;
  reference_solution?: string | null; // server-only, optional
  commented_reference?: string | null; // auto-generated FR comments (server-only)
  canonical_id?: string | null; // link to CanonicalExercise if LLM-assisted
  created_at: string;
  updated_at: string;
};

export type StudentIdentity = {
  id: string;
  exercise_id: string; // TeacherExercise id
  display_name: string;
  join_token: string;
  created_at: string;
};
