import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/teacher/auth";
import { getTeacherExerciseById, getStudentIdentitiesByExercise } from "@/lib/teacher/store";
import { listSessionsByExercise } from "@/lib/session/store";

// GET /api/teacher/exercises/:id/progress — dashboard data
// Roster view + aggregate, no new heavy infra — queries over Session grouped by student_identity_id.
// Progression = indices révélés (comment-based hints), pas d'étapes.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireTeacher(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const ex = getTeacherExerciseById(id);
  if (!ex) return NextResponse.json({ error: "Exercice non trouvé" }, { status: 404 });
  if (ex.teacher_id !== auth.teacher.id) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });

  const identities = getStudentIdentitiesByExercise(id);
  const sessions = listSessionsByExercise(id);

  // Roster: display_name, indices révélés (max sur les sessions), last active, status
  const roster = identities.map((si) => {
    const sessForStudent = sessions.filter((s) => s.student_identity_id === si.id || s.studentIdentityId === si.id);
    const hintsRevealed = sessForStudent.length
      ? Math.max(...sessForStudent.map((s) => s.revealedHints?.length ?? 0))
      : 0;
    const lastActive = sessForStudent.length
      ? sessForStudent.reduce((acc, s) => (s.startedAt > acc ? s.startedAt : acc), sessForStudent[0].startedAt)
      : si.created_at;
    const completed = sessForStudent.some((s) => s.status === "completed");
    return {
      display_name: si.display_name,
      student_identity_id: si.id,
      join_token: si.join_token,
      hintsRevealed,
      lastActive,
      sessionCount: sessForStudent.length,
      completed,
    };
  });

  // Also include anonymous sessions (no student_identity_id) if any — practice mode
  const anonymousSessions = sessions.filter((s) => !s.student_identity_id && !s.studentIdentityId);
  if (anonymousSessions.length) {
    roster.push({
      display_name: "Anonyme (sans code)",
      student_identity_id: "anonymous",
      join_token: "",
      hintsRevealed: Math.max(...anonymousSessions.map((s) => s.revealedHints?.length ?? 0)),
      lastActive: anonymousSessions[0].startedAt,
      sessionCount: anonymousSessions.length,
      completed: anonymousSessions.some((s) => s.status === "completed"),
    });
  }

  const totalStudents = identities.length || 1;
  const completedCount = roster.filter((r) => r.completed).length;

  return NextResponse.json({
    exercise: { id: ex.id, code: ex.code, title: ex.title, visibility: ex.visibility, reference_verified: ex.reference_verified },
    roster,
    aggregates: {
      totalStudents: identities.length,
      totalSessions: sessions.length,
      completedCount,
      completionRate: roster.length ? completedCount / totalStudents : 0,
    },
  });
}
