import type { Session } from "../exercise/types";

// Server-side Session store for teacher dashboard (addendum §7)
// Mirrors the client-side Session shape but is persisted server-side for aggregation.

const sessions = new Map<string, Session>(); // id -> Session
const sessionsByExercise = new Map<string, Set<string>>(); // exerciseId -> Set<sessionId>
const sessionsByStudentIdentity = new Map<string, Set<string>>(); // student_identity_id -> Set<sessionId>

export function createSession(data: Omit<Session, "id" | "startedAt"> & { id?: string }): Session {
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
    student_identity_id: data.student_identity_id ?? data.studentIdentityId ?? null,
    studentIdentityId: data.studentIdentityId ?? data.student_identity_id ?? null,
    userId: data.userId,
  };
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

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function updateSession(id: string, patch: Partial<Session>): Session | null {
  const s = sessions.get(id);
  if (!s) return null;
  const next = { ...s, ...patch } as Session;
  sessions.set(id, next);
  return next;
}

export function listSessionsByExercise(exerciseId: string): Session[] {
  const set = sessionsByExercise.get(exerciseId);
  if (!set) return [];
  return [...set].map((sid) => sessions.get(sid)!).filter(Boolean);
}

export function listSessionsByStudentIdentity(studentIdentityId: string): Session[] {
  const set = sessionsByStudentIdentity.get(studentIdentityId);
  if (!set) return [];
  return [...set].map((sid) => sessions.get(sid)!).filter(Boolean);
}

// For dashboard aggregates — minimal, in-memory GROUP BY
export function getRosterForExercise(exerciseId: string): Array<{ studentIdentityId: string; displayName?: string; hintsRevealed: number; lastActive: string; sessionCount: number }> {
  // This is a placeholder that will be joined with StudentIdentity store in the dashboard route
  const sessList = listSessionsByExercise(exerciseId);
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
