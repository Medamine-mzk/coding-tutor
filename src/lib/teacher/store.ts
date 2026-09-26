import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Teacher, TeacherExercise, StudentIdentity } from "./types";
import type { Step } from "../exercise/stepPlan";
import type { TestCase } from "../exercise/types";

// In-memory stores — same pattern as canonicalStore / embeddingIndex
// Persist teachers/sessions to disk for dev (survives HMR/restart), will be replaced by Prisma/Supabase when DATABASE_URL is set.
const DATA_DIR = join(process.cwd(), ".tmp");
const DATA_FILE = join(DATA_DIR, "teacher-store.json");

const teachers = new Map<string, Teacher>();
const teacherByEmail = new Map<string, string>(); // email -> teacherId
const teacherSessions = new Map<string, { teacherId: string; expiresAt: number }>(); // token -> session
const magicTokens = new Map<string, { email: string; name: string; expiresAt: number }>(); // token -> pending magic link

function loadFromDisk() {
  try {
    if (!existsSync(DATA_FILE)) return;
    const raw = readFileSync(DATA_FILE, "utf-8");
    const data = JSON.parse(raw) as {
      teachers?: [string, Teacher][];
      teacherByEmail?: [string, string][];
      teacherSessions?: [string, { teacherId: string; expiresAt: number }][];
      teacherExercises?: [string, TeacherExercise][];
      teacherExercisesByCode?: [string, string][];
      teacherExercisesByTeacher?: [string, string[]][];
      studentIdentities?: [string, StudentIdentity][];
      studentIdentitiesByExercise?: [string, string[]][];
    };
    if (data.teachers) for (const [k, v] of data.teachers) teachers.set(k, v);
    if (data.teacherByEmail) for (const [k, v] of data.teacherByEmail) teacherByEmail.set(k, v);
    if (data.teacherSessions) for (const [k, v] of data.teacherSessions) teacherSessions.set(k, v);
    if (data.teacherExercises) for (const [k, v] of data.teacherExercises) teacherExercises.set(k, v);
    if (data.teacherExercisesByCode) for (const [k, v] of data.teacherExercisesByCode) teacherExercisesByCode.set(k, v);
    if (data.teacherExercisesByTeacher) for (const [k, v] of data.teacherExercisesByTeacher) teacherExercisesByTeacher.set(k, new Set(v));
    if (data.studentIdentities) for (const [k, v] of data.studentIdentities) studentIdentities.set(k, v);
    if (data.studentIdentitiesByExercise) for (const [k, v] of data.studentIdentitiesByExercise) studentIdentitiesByExercise.set(k, new Set(v));
  } catch {}
}

function saveToDisk() {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const data = {
      teachers: [...teachers.entries()],
      teacherByEmail: [...teacherByEmail.entries()],
      teacherSessions: [...teacherSessions.entries()],
      teacherExercises: [...teacherExercises.entries()],
      teacherExercisesByCode: [...teacherExercisesByCode.entries()],
      teacherExercisesByTeacher: [...teacherExercisesByTeacher.entries()].map(([k, v]) => [k, [...v]] as [string, string[]]),
      studentIdentities: [...studentIdentities.entries()],
      studentIdentitiesByExercise: [...studentIdentitiesByExercise.entries()].map(([k, v]) => [k, [...v]] as [string, string[]]),
    };
    writeFileSync(DATA_FILE, JSON.stringify(data), "utf-8");
  } catch {}
}

// Load once at module init (dev HMR will re-execute, but file persists)
loadFromDisk();

const teacherExercises = new Map<string, TeacherExercise>(); // id -> exercise
const teacherExercisesByCode = new Map<string, string>(); // code -> id
const teacherExercisesByTeacher = new Map<string, Set<string>>(); // teacherId -> Set<id>

const studentIdentities = new Map<string, StudentIdentity>(); // join_token -> identity
const studentIdentitiesByExercise = new Map<string, Set<string>>(); // exercise_id -> Set<join_token>

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1 confusion
function randomCode(): string {
  let s = "";
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return `PY-${s}`;
}

export function getTeacherById(id: string): Teacher | undefined {
  return teachers.get(id);
}

export function getTeacherByEmail(email: string): Teacher | undefined {
  const id = teacherByEmail.get(email.toLowerCase());
  return id ? teachers.get(id) : undefined;
}

export function createTeacher(email: string, name: string): Teacher {
  const existing = getTeacherByEmail(email);
  if (existing) return existing;
  const id = `t_${randomBytes(6).toString("hex")}`;
  const t: Teacher = { id, name: name.trim() || email.split("@")[0], email: email.toLowerCase(), created_at: new Date().toISOString() };
  teachers.set(id, t);
  teacherByEmail.set(email.toLowerCase(), id);
  saveToDisk();
  return t;
}

export function createMagicToken(email: string, name: string): { token: string; expiresAt: number } {
  const token = randomBytes(24).toString("hex");
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 min
  magicTokens.set(token, { email: email.toLowerCase(), name, expiresAt });
  saveToDisk();
  return { token, expiresAt };
}

export function consumeMagicToken(token: string): { email: string; name: string } | null {
  const rec = magicTokens.get(token);
  if (!rec) return null;
  if (Date.now() > rec.expiresAt) {
    magicTokens.delete(token);
    saveToDisk();
    return null;
  }
  magicTokens.delete(token);
  saveToDisk();
  return { email: rec.email, name: rec.name };
}

export function createTeacherSession(teacherId: string): { token: string; expiresAt: number } {
  const token = randomBytes(24).toString("hex");
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  teacherSessions.set(token, { teacherId, expiresAt });
  saveToDisk();
  return { token, expiresAt };
}

export function getTeacherBySessionToken(token: string): Teacher | null {
  const sess = teacherSessions.get(token);
  if (!sess) return null;
  if (Date.now() > sess.expiresAt) {
    teacherSessions.delete(token);
    saveToDisk();
    return null;
  }
  return teachers.get(sess.teacherId) ?? null;
}

export function deleteTeacherSession(token: string) {
  teacherSessions.delete(token);
  saveToDisk();
}

// --- TeacherExercise ---

export function generateUniqueCode(): string {
  for (let i = 0; i < 20; i++) {
    const c = randomCode();
    if (!teacherExercisesByCode.has(c)) return c;
  }
  // fallback with longer entropy
  return `PY-${randomBytes(3).toString("hex").toUpperCase().slice(0, 6)}`;
}

export function createTeacherExercise(data: Omit<TeacherExercise, "id" | "code" | "created_at" | "updated_at" | "step_plan_version"> & { id?: string; code?: string }): TeacherExercise {
  const id = data.id ?? `ex_${randomBytes(6).toString("hex")}`;
  const code = data.code ?? generateUniqueCode();
  const now = new Date().toISOString();
  const ex: TeacherExercise = {
    id,
    code,
    title: data.title,
    statement: data.statement,
    language: data.language ?? "python",
    concepts: data.concepts ?? [],
    difficulty: data.difficulty ?? 2,
    io_spec: data.io_spec ?? "",
    constraints: data.constraints ?? [],
    examples: data.examples ?? [],
    steps: data.steps ?? [],
    hidden_tests: data.hidden_tests ?? [],
    visible_tests: data.visible_tests ?? [],
    teacher_id: data.teacher_id,
    visibility: data.visibility ?? "code_only",
    created_via: data.created_via,
    reference_verified: data.reference_verified ?? false,
    reference_solution: data.reference_solution ?? null,
    canonical_id: data.canonical_id ?? null,
    step_plan_version: 1,
    created_at: now,
    updated_at: now,
  };
  teacherExercises.set(id, ex);
  teacherExercisesByCode.set(code, id);
  if (!teacherExercisesByTeacher.has(data.teacher_id)) teacherExercisesByTeacher.set(data.teacher_id, new Set());
  teacherExercisesByTeacher.get(data.teacher_id)!.add(id);
  saveToDisk();
  return ex;
}

export function getTeacherExerciseById(id: string): TeacherExercise | undefined {
  return teacherExercises.get(id);
}

export function getTeacherExerciseByCode(code: string): TeacherExercise | undefined {
  const id = teacherExercisesByCode.get(code.toUpperCase());
  return id ? teacherExercises.get(id) : undefined;
}

export function listTeacherExercisesByTeacher(teacherId: string): TeacherExercise[] {
  const ids = teacherExercisesByTeacher.get(teacherId);
  if (!ids) return [];
  return [...ids].map((id) => teacherExercises.get(id)!).filter(Boolean);
}

export function listPublicTeacherExercises(): TeacherExercise[] {
  return [...teacherExercises.values()].filter((e) => e.visibility === "public_library");
}

export function searchPublicExercises(q: string): TeacherExercise[] {
  const lower = q.toLowerCase().trim();
  if (!lower) return listPublicTeacherExercises().slice(0, 20);
  return listPublicTeacherExercises().filter((e) => {
    const hay = `${e.title} ${e.statement} ${e.teacher_id}`.toLowerCase();
    return hay.includes(lower);
  }).slice(0, 20);
}

export function updateTeacherExercise(id: string, updates: Partial<TeacherExercise>): TeacherExercise | null {
  const ex = teacherExercises.get(id);
  if (!ex) return null;
  const next = { ...ex, ...updates, updated_at: new Date().toISOString() } as TeacherExercise;
  // handle code change uniqueness if needed
  if (updates.code && updates.code !== ex.code) {
    if (teacherExercisesByCode.has(updates.code)) return null;
    teacherExercisesByCode.delete(ex.code);
    teacherExercisesByCode.set(updates.code, id);
  }
  teacherExercises.set(id, next);
  saveToDisk();
  return next;
}

export function deleteTeacherExercise(id: string): boolean {
  const ex = teacherExercises.get(id);
  if (!ex) return false;
  teacherExercises.delete(id);
  teacherExercisesByCode.delete(ex.code);
  teacherExercisesByTeacher.get(ex.teacher_id)?.delete(id);
  saveToDisk();
  return true;
}

// --- StudentIdentity ---

export function createStudentIdentity(exerciseId: string, displayName: string): StudentIdentity {
  const id = `si_${randomBytes(6).toString("hex")}`;
  const join_token = randomBytes(16).toString("hex");
  const si: StudentIdentity = { id, exercise_id: exerciseId, display_name: displayName.trim().slice(0, 30) || "Anonyme", join_token, created_at: new Date().toISOString() };
  studentIdentities.set(join_token, si);
  if (!studentIdentitiesByExercise.has(exerciseId)) studentIdentitiesByExercise.set(exerciseId, new Set());
  studentIdentitiesByExercise.get(exerciseId)!.add(join_token);
  saveToDisk();
  return si;
}

export function getStudentIdentityByToken(token: string): StudentIdentity | undefined {
  return studentIdentities.get(token);
}

export function getStudentIdentitiesByExercise(exerciseId: string): StudentIdentity[] {
  const set = studentIdentitiesByExercise.get(exerciseId);
  if (!set) return [];
  return [...set].map((t) => studentIdentities.get(t)!).filter(Boolean);
}

// For tests / dev
export function clearTeacherStores() {
  teachers.clear();
  teacherByEmail.clear();
  teacherSessions.clear();
  magicTokens.clear();
  teacherExercises.clear();
  teacherExercisesByCode.clear();
  teacherExercisesByTeacher.clear();
  studentIdentities.clear();
  studentIdentitiesByExercise.clear();
  saveToDisk();
}

export function getTeacherCounts() {
  return {
    teachers: teachers.size,
    exercises: teacherExercises.size,
    studentIdentities: studentIdentities.size,
  };
}
