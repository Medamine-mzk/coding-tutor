import { NextRequest, NextResponse } from "next/server";
import { getTeacherExerciseByCode, getTeacherExerciseById, getStudentIdentityByToken } from "@/lib/teacher/store";
import { teacherExerciseToClientExercise } from "@/lib/teacher/toExerciseView";

// GET /api/student/exercise?code=PY-XXXX or ?join_token=xxx
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const joinToken = req.nextUrl.searchParams.get("join_token") ?? req.nextUrl.searchParams.get("joinToken");

  let teacherEx: import("@/lib/teacher/types").TeacherExercise | undefined;

  if (joinToken) {
    const si = getStudentIdentityByToken(joinToken);
    if (!si) return NextResponse.json({ error: "join_token invalide" }, { status: 404 });
    teacherEx = getTeacherExerciseById(si.exercise_id);
    if (!teacherEx) return NextResponse.json({ error: "Exercice non trouvé" }, { status: 404 });
  } else if (code) {
    teacherEx = getTeacherExerciseByCode(code.trim().toUpperCase());
    if (!teacherEx) return NextResponse.json({ error: "Code invalide" }, { status: 404 });
  } else {
    return NextResponse.json({ error: "code ou join_token requis" }, { status: 400 });
  }

  // Build client Exercise (helper partagé : exemples + contraintes du prof)
  const exercise = teacherExerciseToClientExercise(teacherEx, "fr");

  return NextResponse.json({ exercise, code: teacherEx.code, reference_verified: teacherEx.reference_verified });
}
