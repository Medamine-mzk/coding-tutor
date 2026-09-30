import { NextRequest, NextResponse } from "next/server";
import { getTeacherExerciseByCode, getTeacherExerciseById, createStudentIdentity, getStudentIdentityByToken } from "@/lib/teacher/store";
import { createSession } from "@/lib/session/store";
import { teacherExerciseToClientExercise } from "@/lib/teacher/toExerciseView";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const { code, display_name, displayName, join_token, joinToken } = body as {
    code?: string;
    display_name?: string;
    displayName?: string;
    join_token?: string;
    joinToken?: string;
  };

  const tokenRaw = join_token ?? joinToken;
  // Resume flow: if join_token provided, try to resume without creating new identity
  if (tokenRaw && typeof tokenRaw === "string") {
    const existing = await getStudentIdentityByToken(tokenRaw);
    if (existing) {
      // existing.exercise_id is a TeacherExercise id (not a code)
      const teacherEx = await getTeacherExerciseById(existing.exercise_id);
      if (!teacherEx) return NextResponse.json({ error: "Exercice non trouvé pour ce token" }, { status: 404 });
      const exercise = teacherExerciseToClientExercise(teacherEx);
      return NextResponse.json({ ok: true, resumed: true, studentIdentity: existing, exercise, join_token: existing.join_token });
    }
  }

  if (!code || typeof code !== "string" || !code.trim()) {
    return NextResponse.json({ error: "code requis (ex: PY-7X2K)" }, { status: 400 });
  }

  const nameRaw = display_name ?? displayName;
  if (!nameRaw || typeof nameRaw !== "string" || !nameRaw.trim()) {
    return NextResponse.json({ error: "display_name requis (1-30 caractères)" }, { status: 400 });
  }

  const teacherEx = await getTeacherExerciseByCode(code.trim().toUpperCase());
  if (!teacherEx) {
    return NextResponse.json({ error: "Code invalide ou exercice non trouvé" }, { status: 404 });
  }

  const si = await createStudentIdentity(teacherEx.id, nameRaw.trim());

  // Create a server-side Session pinned to this exercise's version
  const session = await createSession({
    exerciseId: teacherEx.id,
    canonicalExerciseId: teacherEx.canonical_id ?? teacherEx.id,
    currentCode: "",
    status: "in_progress",
    student_identity_id: si.id,
    studentIdentityId: si.id,
  });

  const exercise = teacherExerciseToClientExercise(teacherEx);

  const res = NextResponse.json({
    ok: true,
    studentIdentity: si,
    exercise,
    session,
    join_token: si.join_token,
  });

  // Also set a cookie for convenience (not httpOnly so client can read, but also httpOnly for server)
  res.cookies.set("student_join_token", si.join_token, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return res;
}


