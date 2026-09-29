import { NextRequest, NextResponse } from "next/server";
import { getTeacherExerciseById, getStudentIdentityByToken, updateTeacherExercise } from "@/lib/teacher/store";
import { createSession, listSessionsByExercise, updateSession } from "@/lib/session/store";
import { addComments } from "@/lib/teacher/addComments";
import { parseCommentedReference, getHintText } from "@/lib/tutor/commentHints";

// POST /api/student/hints — progressive comment-based hint reveal.
// Body: { join_token: string; hasRun?: boolean }
// Server holds the commented reference and tracks revealed pairs per session,
// so devtools cannot fetch the full solution (levels 4-5 need hasRun=true).
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  const { join_token, joinToken, hasRun } = body as { join_token?: string; joinToken?: string; hasRun?: boolean };
  const token = join_token ?? joinToken;
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "join_token requis" }, { status: 400 });
  }

  const si = getStudentIdentityByToken(token);
  if (!si) return NextResponse.json({ error: "join_token invalide" }, { status: 404 });
  const teacherEx = getTeacherExerciseById(si.exercise_id);
  if (!teacherEx) return NextResponse.json({ error: "Exercice non trouvé" }, { status: 404 });

  // Commented reference: stored, or generated on the fly from reference_solution
  let commented = teacherEx.commented_reference ?? null;
  if (!commented) {
    if (!teacherEx.reference_solution?.trim()) {
      return NextResponse.json({ error: "Aucune solution de référence pour cet exercice" }, { status: 400 });
    }
    try {
      commented = addComments(teacherEx.reference_solution);
      updateTeacherExercise(teacherEx.id, { commented_reference: commented });
    } catch (e) {
      return NextResponse.json({ error: `Commentaires impossibles: ${e instanceof Error ? e.message : String(e)}` }, { status: 400 });
    }
  }

  const pairs = parseCommentedReference(commented);
  if (pairs.length === 0) {
    return NextResponse.json({ error: "Référence vide" }, { status: 400 });
  }

  // Session for this identity+exercise (join creates one; resume reuses latest)
  const sessions = listSessionsByExercise(teacherEx.id).filter(
    (s) => s.student_identity_id === si.id || s.studentIdentityId === si.id
  );
  let sess = sessions.sort((a, b) => (b.startedAt > a.startedAt ? 1 : -1))[0];
  if (!sess) {
    sess = createSession({
      exerciseId: teacherEx.id,
      canonicalExerciseId: teacherEx.canonical_id ?? teacherEx.id,
      currentCode: "",
      status: "in_progress",
      student_identity_id: si.id,
      studentIdentityId: si.id,
    });
  }
  const revealed = [...(sess.revealedHints ?? [])];
  const levelOf = (idx: number) => revealed.find((r) => r.pair === idx)?.level ?? 0;
  const maxLevelOf = (idx: number) => (pairs[idx].codeLine ? 5 : 1);

  const current = pairs.findIndex((_, idx) => levelOf(idx) < maxLevelOf(idx));
  if (current === -1) {
    return NextResponse.json({
      done: true,
      pairIndex: pairs.length - 1,
      level: 5,
      totalPairs: pairs.length,
      revealedCount: revealed.length,
      text: "Tous les indices ont été révélés — à toi de jouer !",
    });
  }

  let nextLevel = levelOf(current) + 1;
  // Levels 4-5 show near-complete code: require a run since last hint (MVP trust).
  // Without a run, stay at level 3 and signal the requirement.
  if (nextLevel >= 4 && !hasRun) {
    if (levelOf(current) >= 3) {
      return NextResponse.json({
        pairIndex: current,
        level: 3,
        totalPairs: pairs.length,
        revealedCount: revealed.length,
        capped: true,
        text: getHintText(pairs[current], 3),
        note: "Exécute ton code (Run) pour débloquer les niveaux 4-5.",
      });
    }
    nextLevel = 3;
  }

  const entry = revealed.find((r) => r.pair === current);
  if (entry) entry.level = nextLevel;
  else revealed.push({ pair: current, level: nextLevel });
  updateSession(sess.id, { revealedHints: revealed });

  return NextResponse.json({
    pairIndex: current,
    level: nextLevel,
    totalPairs: pairs.length,
    revealedCount: revealed.length,
    capped: false,
    text: getHintText(pairs[current], nextLevel),
  });
}
