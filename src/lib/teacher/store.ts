import { createHash, createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Teacher, TeacherExercise, StudentIdentity } from "./types";
import type { TestCase } from "../exercise/types";

// In-memory stores for dev (teachers/exercises/identities persist to disk).
// Auth tokens (magic-link + sessions) are STATELESS HMAC-signed payloads so
// login works on serverless (Vercel): any instance can verify without shared
// memory. Requires TEACHER_AUTH_SECRET in production (fail closed without it).
function authSecret(): string {
  const s = process.env.TEACHER_AUTH_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("TEACHER_AUTH_SECRET manquant (min 16 caractères)");
  }
  return "dev-only-insecure-secret";
}

function b64urlEncode(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), "utf-8").toString("base64url");
}

function b64urlDecode<T>(s: string): T | null {
  try {
    return JSON.parse(Buffer.from(s, "base64url").toString("utf-8")) as T;
  } catch {
    return null;
  }
}

function sign(payload: string): string {
  return createHmac("sha256", authSecret()).update(payload, "utf-8").digest("base64url");
}

function verifySigned(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  const a = Buffer.from(sig, "utf-8");
  const b = Buffer.from(expected, "utf-8");
  if (a.length !== b.length) return null;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  if (diff !== 0) return null;
  return payload;
}

// In-memory stores — same pattern as canonicalStore / embeddingIndex
// Persist teachers/exercises to disk for dev (survives HMR/restart), will be replaced by Prisma/Supabase when DATABASE_URL is set.
const DATA_DIR = join(process.cwd(), ".tmp");
const DATA_FILE = join(DATA_DIR, "teacher-store.json");

const teachers = new Map<string, Teacher>();
const teacherByEmail = new Map<string, string>(); // email -> teacherId

function loadFromDisk() {
  try {
    if (!existsSync(DATA_FILE)) return;
    const raw = readFileSync(DATA_FILE, "utf-8");
    const data = JSON.parse(raw) as {
      teachers?: [string, Teacher][];
      teacherByEmail?: [string, string][];
      teacherExercises?: [string, TeacherExercise][];
      teacherExercisesByCode?: [string, string][];
      teacherExercisesByTeacher?: [string, string[]][];
      studentIdentities?: [string, StudentIdentity][];
      studentIdentitiesByExercise?: [string, string[]][];
    };
    if (data.teachers) for (const [k, v] of data.teachers) teachers.set(k, v);
    if (data.teacherByEmail) for (const [k, v] of data.teacherByEmail) teacherByEmail.set(k, v);
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

export function teacherIdForEmail(email: string): string {
  // Deterministic id so the same teacher resolves identically on every
  // serverless instance without shared storage.
  return `t_${createHash("sha256").update(email.toLowerCase(), "utf-8").digest("hex").slice(0, 12)}`;
}

export function createTeacher(email: string, name: string): Teacher {
  const existing = getTeacherByEmail(email);
  if (existing) return existing;
  const id = teacherIdForEmail(email);
  const t: Teacher = { id, name: name.trim() || email.split("@")[0], email: email.toLowerCase(), created_at: new Date().toISOString() };
  teachers.set(id, t);
  teacherByEmail.set(email.toLowerCase(), id);
  saveToDisk();
  return t;
}

type MagicPayload = { email: string; name: string; exp: number };

export function createMagicToken(email: string, name: string): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 min
  const payload = b64urlEncode({ email: email.toLowerCase(), name, exp: expiresAt } satisfies MagicPayload);
  return { token: `${payload}.${sign(payload)}`, expiresAt };
}

export function consumeMagicToken(token: string): { email: string; name: string } | null {
  // Stateless: verify signature + expiry. Single-use is not enforced
  // server-side (no shared store on serverless); the 15-min window bounds replay.
  const payload = verifySigned(token);
  if (!payload) return null;
  const rec = b64urlDecode<MagicPayload>(payload);
  if (!rec || typeof rec.email !== "string" || typeof rec.exp !== "number") return null;
  if (Date.now() > rec.exp) return null;
  return { email: rec.email, name: rec.name ?? "" };
}

type SessionPayload = { id: string; email: string; name: string; created_at: string; exp: number };

export function createTeacherSession(teacher: Teacher): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  const payload = b64urlEncode({
    id: teacher.id,
    email: teacher.email,
    name: teacher.name,
    created_at: teacher.created_at,
    exp: expiresAt,
  } satisfies SessionPayload);
  return { token: `${payload}.${sign(payload)}`, expiresAt };
}

export function getTeacherBySessionToken(token: string): Teacher | null {
  // Self-contained: the teacher identity travels inside the signed session,
  // so any serverless instance can validate without shared memory.
  const payload = verifySigned(token);
  if (!payload) return null;
  const rec = b64urlDecode<SessionPayload>(payload);
  if (!rec || typeof rec.id !== "string" || typeof rec.email !== "string") return null;
  if (Date.now() > rec.exp) return null;
  return { id: rec.id, email: rec.email, name: rec.name ?? "", created_at: rec.created_at ?? new Date().toISOString() };
}

export function deleteTeacherSession(_token: string) {
  // No-op: sessions are stateless — logout clears the cookie client-side.
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

export function createTeacherExercise(data: Omit<TeacherExercise, "id" | "code" | "created_at" | "updated_at"> & { id?: string; code?: string }): TeacherExercise {
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
    hidden_tests: data.hidden_tests ?? [],
    visible_tests: data.visible_tests ?? [],
    teacher_id: data.teacher_id,
    visibility: data.visibility ?? "code_only",
    created_via: data.created_via,
    reference_verified: data.reference_verified ?? false,
    reference_solution: data.reference_solution ?? null,
    commented_reference: data.commented_reference ?? null,
    canonical_id: data.canonical_id ?? null,
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
