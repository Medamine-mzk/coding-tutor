import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/teacher/auth";
import { getTeacherExerciseById, updateTeacherExercise, deleteTeacherExercise } from "@/lib/teacher/store";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireTeacher(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const ex = getTeacherExerciseById(id);
  if (!ex) return NextResponse.json({ error: "Exercice non trouvé" }, { status: 404 });
  if (ex.teacher_id !== auth.teacher.id) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  return NextResponse.json({ exercise: ex });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireTeacher(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const ex = getTeacherExerciseById(id);
  if (!ex) return NextResponse.json({ error: "Exercice non trouvé" }, { status: 404 });
  if (ex.teacher_id !== auth.teacher.id) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  // Only allow editing before publish? For MVP, allow any update but don't change code.
  const allowed: (keyof typeof ex)[] = ["title", "statement", "io_spec", "constraints", "examples", "concepts", "difficulty", "steps", "hidden_tests", "visible_tests", "visibility", "reference_solution"];
  const updates: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in b) updates[k] = b[k as string];
  }
  const next = updateTeacherExercise(id, updates as Partial<typeof ex>);
  if (!next) return NextResponse.json({ error: "Mise à jour échouée" }, { status: 400 });
  return NextResponse.json({ ok: true, exercise: next });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireTeacher(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const ex = getTeacherExerciseById(id);
  if (!ex) return NextResponse.json({ error: "Exercice non trouvé" }, { status: 404 });
  if (ex.teacher_id !== auth.teacher.id) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  deleteTeacherExercise(id);
  return NextResponse.json({ ok: true });
}
