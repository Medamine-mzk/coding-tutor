import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/teacher/auth";
import { createTeacherExercise, listTeacherExercisesByTeacher, listPublicTeacherExercises } from "@/lib/teacher/store";
import type { Step } from "@/lib/exercise/stepPlan";
import type { TestCase } from "@/lib/exercise/types";

function isValidStep(s: unknown): s is Step {
  if (!s || typeof s !== "object") return false;
  const o = s as Record<string, unknown>;
  return typeof o["title"] === "string" && typeof o["order"] === "number" && typeof o["check_type"] === "string";
}

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
    steps?: unknown[];
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

  const steps = (b.steps ?? []) as Step[];
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > 7) {
    return NextResponse.json({ error: "steps: 1 à 7 requis, chaque step doit avoir title/goal/check_type" }, { status: 400 });
  }
  for (const s of steps) {
    if (!isValidStep(s)) return NextResponse.json({ error: "step invalide: title/order/check_type requis" }, { status: 400 });
  }

  // Validate reference if provided — re-run verification before allowing reference_verified:true
  let reference_verified = false;
  let reference_solution: string | null = null;
  if (b.reference_solution && typeof b.reference_solution === "string" && b.reference_solution.trim()) {
    reference_solution = b.reference_solution;
    // We don't auto-verify here; verification happens on publish (see publish route).
    // For manual without reference, it stays false and dashboard shows warning (addendum 3.1.2).
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
    steps: steps as Step[],
    hidden_tests: b.hidden_tests ?? [],
    visible_tests: b.visible_tests ?? [],
    language: (b.language as "python") ?? "python",
    visibility: b.visibility ?? "code_only",
    created_via: "manual",
    reference_verified,
    reference_solution,
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
