import { NextRequest, NextResponse } from "next/server";
import { getTeacherExerciseByCode, getTeacherExerciseById, getStudentIdentityByToken } from "@/lib/teacher/store";
import { toExerciseView } from "@/lib/exercise/exerciseService";
import type { Exercise } from "@/lib/exercise/types";

// GET /api/student/exercise?code=PY-XXXX or ?join_token=xxx&currentStepOrder=2
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const joinToken = req.nextUrl.searchParams.get("join_token") ?? req.nextUrl.searchParams.get("joinToken");
  const currentStepOrderRaw = req.nextUrl.searchParams.get("currentStepOrder");
  const currentStepOrder = currentStepOrderRaw ? Math.max(1, Math.min(7, parseInt(currentStepOrderRaw, 10) || 1)) : 1;

  let teacherEx: import("@/lib/teacher/types").TeacherExercise | undefined;

  if (joinToken) {
    const si = getStudentIdentityByToken(joinToken);
    if (!si) return NextResponse.json({ error: "join_token invalide" }, { status: 404 });
    teacherEx = getTeacherExerciseById(si.exercise_id);
    if (!teacherEx) return NextResponse.json({ error: "Exercice non trouvé" }, { status: 404 });
  } else if (code) {
    teacherEx = getTeacherExerciseByCode(code.trim().toUpperCase());
    if (!teacherEx) return NextResponse.json({ error: "Code invalide" }, { status: 404 });
    // code_only vs public_library is already enforced by direct code lookup (only code holders can fetch)
  } else {
    return NextResponse.json({ error: "code ou join_token requis" }, { status: 400 });
  }

  // Build client Exercise with progressive disclosure
  const canonical = {
    id: teacherEx.canonical_id ?? `canon_${teacherEx.id}`,
    example_signature: "teacher",
    text_embedding: [],
    concepts: teacherEx.concepts,
    io_spec: teacherEx.io_spec,
    languages: {
      fr: {
        title: teacherEx.title,
        statement_display: teacherEx.statement,
        step_titles: teacherEx.steps.map((s) => s.title),
        step_goals: teacherEx.steps.map((s) => s.goal),
      },
    },
    reference_solution_ref: teacherEx.reference_solution ? `ref_${teacherEx.id}` : "",
    reference_solution: teacherEx.reference_solution ?? "",
    step_plan_version: teacherEx.step_plan_version,
    step_plan: teacherEx.steps,
    hidden_tests: teacherEx.hidden_tests,
    visible_tests: teacherEx.visible_tests,
    hit_count: 0,
    created_at: teacherEx.created_at,
  } as import("@/lib/exercise/stepPlan").CanonicalExercise;

  const exercise = toExerciseView(canonical, "fr", currentStepOrder);

  return NextResponse.json({ exercise, code: teacherEx.code, reference_verified: teacherEx.reference_verified });
}
