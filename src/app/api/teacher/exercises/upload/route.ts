import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/teacher/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { createTeacherExercise } from "@/lib/teacher/store";
import { addComments } from "@/lib/teacher/addComments";
import type { TestCase } from "@/lib/exercise/types";

const RATE_MAX = 10;
const RATE_WINDOW_MS = 60_000;

function getIP(req: NextRequest): string {
  const f = req.headers.get("x-forwarded-for");
  if (f) return f.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

// POST /api/teacher/exercises/upload — simplified: exercise.md + reference.py only
// No steps.json needed — hints are auto-generated from commented reference.
export async function POST(req: NextRequest) {
  const auth = requireTeacher(req);
  if ("error" in auth) return auth.error;

  const ip = getIP(req);
  const rate = checkRateLimit("teacher-upload", ip, RATE_MAX, RATE_WINDOW_MS);
  const headers = rateLimitHeaders(rate.remaining, rate.resetAt, RATE_MAX);
  if (!rate.allowed) return NextResponse.json({ error: "Trop de requêtes" }, { status: 429, headers });

  let exerciseMd: string | null = null;
  let referenceSolution: string | null = null;

  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const f1 = form.get("exercise.md") ?? form.get("exerciseMd") ?? form.get("file1");
    const f3 = form.get("reference.py") ?? form.get("referenceSolution");
    if (f1 instanceof File) exerciseMd = await f1.text();
    else if (typeof f1 === "string") exerciseMd = f1;
    if (f3 instanceof File) referenceSolution = await f3.text();
    else if (typeof f3 === "string") referenceSolution = f3;
  } else {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON ou multipart attendu" }, { status: 400, headers });
    }
    const b = body as { exerciseMd?: string; exercise_md?: string; referenceSolution?: string };
    exerciseMd = b.exerciseMd ?? b.exercise_md ?? null;
    referenceSolution = b.referenceSolution ?? null;
  }

  if (!exerciseMd) {
    return NextResponse.json({ error: "exercise.md requis" }, { status: 400, headers });
  }

  // Parse exercise.md frontmatter + markdown
  let title = "Exercice importé";
  let statement = "";
  let language: "python" = "python";
  let concepts: string[] = ["loops"];
  let difficulty: 1 | 2 | 3 | 4 | 5 = 2;
  let ioSpec = "";
  let constraints: string[] = [];
  let examples: Array<{ input: string; output: string }> = [];
  let hidden_tests: TestCase[] = [];
  let visible_tests: TestCase[] = [];

  try {
    const fmMatch = exerciseMd.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
    let bodyMd = exerciseMd;
    if (fmMatch) {
      const fm = fmMatch[1];
      bodyMd = fmMatch[2];
      for (const line of fm.split("\n")) {
        const m = line.match(/^\s*(\w+)\s*:\s*(.+)\s*$/);
        if (!m) continue;
        const k = m[1].trim();
        const v = m[2].trim();
        if (k === "title") title = v;
        else if (k === "language") language = v as "python";
        else if (k === "concepts") {
          try {
            concepts = JSON.parse(v);
          } catch {
            concepts = v.replace(/[\[\]]/g, "").split(",").map((s) => s.trim()).filter(Boolean);
          }
        } else if (k === "difficulty") difficulty = (parseInt(v, 10) as 1 | 2 | 3 | 4 | 5) || 2;
      }
      statement = bodyMd.trim();
      const exMatch = bodyMd.match(/##\s*Examples\s*([\s\S]*?)(?:##|$)/i);
      if (exMatch) {
        const exBlock = exMatch[1];
        const pairs = [...exBlock.matchAll(/-\s*input:\s*([^\n]+)\s*\n\s*output:\s*([^\n]+)/gi)];
        for (const p of pairs) {
          examples.push({ input: p[1].trim(), output: p[2].trim() });
        }
      }
      const cMatch = bodyMd.match(/##\s*Constraints\s*([\s\S]*?)(?:##|$)/i);
      if (cMatch) {
        constraints = cMatch[1].split("\n").map((l) => l.trim()).filter(Boolean);
      }
    } else {
      statement = exerciseMd.trim();
    }

    if (!statement) statement = exerciseMd.slice(0, 500);
    if (examples.length === 0) {
      const { extractExamples, extractIOSpec } = await import("@/lib/exercise/parser");
      examples = extractExamples(statement);
      ioSpec = extractIOSpec(statement);
    }
  } catch (e) {
    return NextResponse.json({ error: `Erreur parsing exercise.md: ${e instanceof Error ? e.message : String(e)}` }, { status: 400, headers });
  }

  // Auto-generate commented reference if reference provided
  let commentedReference: string | null = null;
  let reference_verified = false;
  let warning: string | null = null;
  if (referenceSolution && referenceSolution.trim()) {
    try {
      commentedReference = addComments(referenceSolution);
      reference_verified = true;
    } catch (e) {
      warning = `Erreur génération commentaires: ${e instanceof Error ? e.message : String(e)}`;
    }
  } else {
    warning = "Aucune solution de référence fournie — les indices seront générés à partir de l'énoncé uniquement.";
  }

  const ex = createTeacherExercise({
    teacher_id: auth.teacher.id,
    title: title.trim(),
    statement: statement.trim(),
    language,
    concepts,
    difficulty,
    io_spec: ioSpec ?? "",
    constraints,
    examples,
    hidden_tests,
    visible_tests,
    visibility: "code_only",
    created_via: "upload",
    reference_verified,
    reference_solution: referenceSolution,
    commented_reference: commentedReference,
  });

  return NextResponse.json({ ok: true, exercise: ex, warning }, { status: 201, headers });
}
