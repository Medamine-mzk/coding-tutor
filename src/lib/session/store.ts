import type { Session, RevealedHint } from "../exercise/types";
import { getSupabase } from "../db/supabase";

// Server-side Session store for teacher dashboard (progression).
// DB-first when Supabase is configured, in-memory fallback otherwise.
// revealedHints drives the teacher progression view (hints revealed per pair).

const sessions = new Map<string, Session>(); // id -> Session
const sessionsByExercise = new Map<string, Set<string>>(); // exerciseId -> Set<sessionId>
const sessionsByStudentIdentity = new Map<string, Set<string>>(); // student_identity_id -> Set<sessionId>

type SessionRow = {
  id: string; exercise_id: string; canonical_exercise_id: string | null;
  current_code: string; status: string; started_at: string; finished_at: string | null;
  revealed_hints: unknown; student_identity_id: string | null; user_id: string | null;
};

function rowToSession(r: SessionRow): Session {
  return {
    id: r.id,
    exerciseId: r.exercise_id,
    canonicalExerciseId: r.canonical_exercise_id,
    currentCode: r.current_code ?? "",
    status: (r.status ?? "in_progress") as Session["status"],
    startedAt: r.started_at,
    finishedAt: r.finished_at ?? undefined,
    revealedHints: Array.isArray(r.revealed_hints) ? (r.revealed_hints as RevealedHint[]) : [],
    student_identity_id: r.student_identity_id,
    studentIdentityId: r.student_identity_id,
    userId: r.user_id ?? undefined,
  };
}

function sessionToRow(s: Session): Record<string, unknown> {
  return {
    id: s.id,
    exercise_id: s.exerciseId,
    canonical_exercise_id: s.canonicalExerciseId ?? null,
    current_code: s.currentCode ?? "",
    status: s.status ?? "in_progress",
    started_at: s.startedAt,
    finished_at: s.finishedAt ?? null,
    revealed_hints: s.revealedHints ?? [],
    student_identity_id: s.student_identity_id ?? s.studentIdentityId ?? null,
    user_id: s.userId ?? null,
  };
}

export async function createSession(data: Omit<Session, "id" | "startedAt"> & { id?: string }): Promise<Session> {
  const id = data.id ?? `sess_${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString();
  const sess: Session = {
    id,
    exerciseId: data.exerciseId,
    canonicalExerciseId: data.canonicalExerciseId ?? null,
    currentCode: data.currentCode ?? "",
    status: data.status ?? "in_progress",
    startedAt: now,
    finishedAt: data.finishedAt,
    revealedHints: data.revealedHints ?? [],
    student_identity_id: data.student_identity_id ?? data.studentIdentityId ?? null,
    studentIdentityId: data.studentIdentityId ?? data.student_identity_id ?? null,
    userId: data.userId,
  };
  const db = getSupabase();
  if (db) {
    const { data: row, error } = await db.from("sessions").insert(sessionToRow(sess)).select().single();
    if (error) throw new Error(`createSession DB: ${error.message}`);
    return rowToSession(row as SessionRow);
  }
  sessions.set(id, sess);
  if (!sessionsByExercise.has(sess.exerciseId)) sessionsByExercise.set(sess.exerciseId, new Set());
  sessionsByExercise.get(sess.exerciseId)!.add(id);
  const sid = sess.student_identity_id ?? sess.studentIdentityId;
  if (sid) {
    if (!sessionsByStudentIdentity.has(sid)) sessionsByStudentIdentity.set(sid, new Set());
    sessionsByStudentIdentity.get(sid)!.add(id);
  }
  return sess;
}

export async function getSession(id: string): Promise<Session | undefined> {
  const db = getSupabase();
  if (db) {
    const { data } = await db.from("sessions").select("*").eq("id", id).maybeSingle();
    return data ? rowToSession(data as SessionRow) : undefined;
  }
  return sessions.get(id);
}

export async function updateSession(id: string, patch: Partial<Session>): Promise<Session | null> {
  const db = getSupabase();
  if (db) {
    const rowPatch: Record<string, unknown> = {};
    if (patch.currentCode !== undefined) rowPatch.current_code = patch.currentCode;
    if (patch.status !== undefined) rowPatch.status = patch.status;
    if (patch.finishedAt !== undefined) rowPatch.finished_at = patch.finishedAt;
    if (patch.revealedHints !== undefined) rowPatch.revealed_hints = patch.revealedHints;
    if (patch.exerciseId !== undefined) rowPatch.exercise_id = patch.exerciseId;
    if (patch.canonicalExerciseId !== undefined) rowPatch.canonical_exercise_id = patch.canonicalExerciseId;
    const { data, error } = await db.from("sessions").update(rowPatch).eq("id", id).select().single();
    if (error) return null;
    return data ? rowToSession(data as SessionRow) : null;
  }
  const s = sessions.get(id);
  if (!s) return null;
  const next = { ...s, ...patch } as Session;
  sessions.set(id, next);
  return next;
}

export async function listSessionsByExercise(exerciseId: string): Promise<Session[]> {
  const db = getSupabase();
  if (db) {
    const { data } = await db.from("sessions").select("*").eq("exercise_id", exerciseId).order("started_at", { ascending: true });
    return (data as SessionRow[] | null ?? []).map(rowToSession);
  }
  const set = sessionsByExercise.get(exerciseId);
  if (!set) return [];
  return [...set].map((sid) => sessions.get(sid)!).filter(Boolean);
}

export async function listSessionsByStudentIdentity(studentIdentityId: string): Promise<Session[]> {
  const db = getSupabase();
  if (db) {
    const { data } = await db.from("sessions").select("*").eq("student_identity_id", studentIdentityId).order("started_at", { ascending: true });
    return (data as SessionRow[] | null ?? []).map(rowToSession);
  }
  const set = sessionsByStudentIdentity.get(studentIdentityId);
  if (!set) return [];
  return [...set].map((sid) => sessions.get(sid)!).filter(Boolean);
}

// For dashboard aggregates — minimal, in-memory GROUP BY
export async function getRosterForExercise(exerciseId: string): Promise<Array<{ studentIdentityId: string; displayName?: string; hintsRevealed: number; lastActive: string; sessionCount: number }>> {
  const sessList = await listSessionsByExercise(exerciseId);
  const byStudent = new Map<string, Session[]>();
  for (const s of sessList) {
    const sid = s.student_identity_id ?? s.studentIdentityId ?? "anonymous";
    if (!byStudent.has(sid)) byStudent.set(sid, []);
    byStudent.get(sid)!.push(s);
  }
  return [...byStudent.entries()].map(([sid, list]) => {
    const hintsRevealed = Math.max(0, ...list.map((s) => s.revealedHints?.length ?? 0));
    const lastActive = list.reduce((acc, s) => (s.startedAt > acc ? s.startedAt : acc), list[0].startedAt);
    return { studentIdentityId: sid, hintsRevealed, lastActive, sessionCount: list.length };
  });
}

export function clearSessionStore() {
  sessions.clear();
  sessionsByExercise.clear();
  sessionsByStudentIdentity.clear();
}
