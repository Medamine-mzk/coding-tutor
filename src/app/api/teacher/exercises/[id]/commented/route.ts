import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/teacher/auth";
import { getTeacherExerciseById } from "@/lib/teacher/store";
import { addComments } from "@/lib/teacher/addComments";

/**
 * GET /api/teacher/exercises/[id]/commented
 * Version commentée FR de la solution de référence (enseignant uniquement).
 * Server-side, jamais exposée à l'élève (anti-leak : la référence reste secrète).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireTeacher(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const ex = getTeacherExerciseById(id);
  if (!ex) return NextResponse.json({ error: "Exercice non trouvé" }, { status: 404 });
  if (ex.teacher_id !== auth.teacher.id) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  if (!ex.reference_solution) {
    return NextResponse.json({ error: "Pas de solution de référence pour cet exercice" }, { status: 400 });
  }
  try {
    const commented = addComments(ex.reference_solution);
    return NextResponse.json({ commented });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
