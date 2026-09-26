import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/teacher/auth";
import { getTeacherExerciseById, getStudentIdentitiesByExercise } from "@/lib/teacher/store";
import { listSessionsByExercise } from "@/lib/session/store";

// GET /api/teacher/exercises/:id/progress — dashboard data (addendum §7)
// Roster view + aggregate, no new heavy infra — queries over Session grouped by student_identity_id
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireTeacher(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const ex = getTeacherExerciseById(id);
  if (!ex) return NextResponse.json({ error: "Exercice non trouvé" }, { status: 404 });
  if (ex.teacher_id !== auth.teacher.id) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });

  const identities = getStudentIdentitiesByExercise(id);
  const sessions = listSessionsByExercise(id);

  // Roster: display_name, current step (max currentStepOrder), last active, hints used (placeholder)
  // For MVP, hints/attempts are not yet persisted server-side for the teacher flow — we show what we have.
  // The workspace will POST attempts/hints to /api/student/session/:id/* to populate.
  const roster = identities.map((si) => {
    const sessForStudent = sessions.filter((s) => s.student_identity_id === si.id || s.studentIdentityId === si.id);
    const currentStep = sessForStudent.length ? Math.max(...sessForStudent.map((s) => s.currentStepOrder ?? 1)) : 1;
    const lastActive = sessForStudent.length
      ? sessForStudent.reduce((acc, s) => (s.startedAt > acc ? s.startedAt : acc), sessForStudent[0].startedAt)
      : si.created_at;
    return {
      display_name: si.display_name,
      student_identity_id: si.id,
      join_token: si.join_token,
      currentStep,
      lastActive,
      sessionCount: sessForStudent.length,
    };
  });

  // Also include anonymous sessions (no student_identity_id) if any — practice mode
  const anonymousSessions = sessions.filter((s) => !s.student_identity_id && !s.studentIdentityId);
  if (anonymousSessions.length) {
    const maxStep = Math.max(...anonymousSessions.map((s) => s.currentStepOrder ?? 1));
    roster.push({
      display_name: "Anonyme (sans code)",
      student_identity_id: "anonymous",
      join_token: "",
      currentStep: maxStep,
      lastActive: anonymousSessions[0].startedAt,
      sessionCount: anonymousSessions.length,
    } as never);
  }

  // Aggregate: per-step completion rate (simple: count of students whose currentStep > stepOrder)
  const totalStudents = identities.length || 1;
  const maxSteps = ex.steps.length;
  const perStep: Array<{ order: number; title: string; completionRate: number; stalledCount: number }> = [];
  for (let order = 1; order <= maxSteps; order++) {
    const step = ex.steps.find((s) => s.order === order);
    const completed = roster.filter((r) => r.currentStep > order).length;
    const stalled = roster.filter((r) => r.currentStep === order).length;
    perStep.push({
      order,
      title: step?.title ?? `Étape ${order}`,
      completionRate: roster.length ? completed / totalStudents : 0,
      stalledCount: stalled,
    });
  }

  // Find the step with highest stalledCount — "62% stalled on step 3" signal
  const mostStalled = perStep.length ? [...perStep].sort((a, b) => b.stalledCount - a.stalledCount)[0] : null;

  return NextResponse.json({
    exercise: { id: ex.id, code: ex.code, title: ex.title, visibility: ex.visibility, reference_verified: ex.reference_verified },
    roster,
    aggregates: {
      totalStudents: identities.length,
      totalSessions: sessions.length,
      perStep,
      mostStalled,
    },
  });
}
