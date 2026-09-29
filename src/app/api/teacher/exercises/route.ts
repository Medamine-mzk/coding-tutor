import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/teacher/auth";
import { createTeacherExercise, listTeacherExercisesByTeacher, listPublicTeacherExercises } from "@/lib/teacher/store";
import { addComments } from "@/lib/teacher/addComments";
import type { TestCase } from "@/lib/exercise/types";

// POST /api/teacher/exercises — manual create (Phase 1, no LLM, no upload)
export async function POST(req: NextRequest) {
  const auth = requireTeacher(req);
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const b = body as {
    title?: string;
    statement?: string;
    io_spec?: string;
    constraints?: string[];
    examples?: Array<{ input: string; output: string }>;
    concepts?: string[];
    difficulty?: number;
    hidden_tests?: TestCase[];
    visible_tests?: TestCase[];
    language?: string;
    visibility?: "code_only" | "public_library";
    reference_solution?: string | null;
  };

  if (!b.title || typeof b.title !== "string" || !b.title.trim()) {
    return NextResponse.json({ error: "title requis" }, { status: 400 });
  }
  if (!b.statement || typeof b.statement !== "string" || !b.statement.trim()) {
    return NextResponse.json({ error: "statement requis" }, { status: 400 });
  }

  // Reference optionnelle : commentaires FR auto-générés pour les indices.
  // La vérification complète a lieu au publish (voir publish route).
  let reference_verified = false;
  let reference_solution: string | null = null;
  let commented_reference: string | null = null;
  if (b.reference_solution && typeof b.reference_solution === "string" && b.reference_solution.trim()) {
    reference_solution = b.reference_solution;
    try {
      commented_reference = addComments(reference_solution);
    } catch {
      commented_reference = null;
    }
  }

  const ex = createTeacherExercise({
    teacher_id: auth.teacher.id,
    title: b.title.trim(),
    statement: b.statement.trim(),
    io_spec: (b.io_spec as string) ?? "",
    constraints: b.constraints ?? [],
    examples: b.examples ?? [],
    concepts: b.concepts ?? ["loops"],
    difficulty: (b.difficulty as 1 | 2 | 3 | 4 | 5) ?? 2,
    hidden_tests: b.hidden_tests ?? [],
    visible_tests: b.visible_tests ?? [],
    language: (b.language as "python") ?? "python",
    visibility: b.visibility ?? "code_only",
    created_via: "manual",
    reference_verified,
    reference_solution,
    commented_reference,
  });

  return NextResponse.json({ ok: true, exercise: ex }, { status: 201 });
}

// GET /api/teacher/exercises — list own (and ?public=1 for public library)
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  if (url.searchParams.get("public") === "1") {
    const q = url.searchParams.get("q") ?? "";
    const { searchPublicExercises, listPublicTeacherExercises } = await import("@/lib/teacher/store");
    const list = q ? searchPublicExercises(q) : listPublicTeacherExercises();
    return NextResponse.json({ exercises: list });
  }

  const auth = requireTeacher(req);
  if ("error" in auth) return auth.error;

  const list = listTeacherExercisesByTeacher(auth.teacher.id);
  return NextResponse.json({ exercises: list });
}
