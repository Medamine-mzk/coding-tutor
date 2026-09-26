import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/teacher/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { createTeacherExercise } from "@/lib/teacher/store";
import type { Step } from "@/lib/exercise/stepPlan";
import type { TestCase } from "@/lib/exercise/types";

const RATE_MAX = 10;
const RATE_WINDOW_MS = 60_000;

function getIP(req: NextRequest): string {
  const f = req.headers.get("x-forwarded-for");
  if (f) return f.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

// POST /api/teacher/exercises/upload — two-file bundle (addendum §5)
// Expects multipart/form-data with exercise.md + steps.json (+ optional reference.py)
// Or JSON {exerciseMd: string, stepsJson: string, referenceSolution?: string}
export async function POST(req: NextRequest) {
  const auth = requireTeacher(req);
  if ("error" in auth) return auth.error;

  const ip = getIP(req);
  const rate = checkRateLimit("teacher-upload", ip, RATE_MAX, RATE_WINDOW_MS);
  const headers = rateLimitHeaders(rate.remaining, rate.resetAt, RATE_MAX);
  if (!rate.allowed) return NextResponse.json({ error: "Trop de requêtes" }, { status: 429, headers });

  let exerciseMd: string | null = null;
  let stepsJson: string | null = null;
  let referenceSolution: string | null = null;

  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const f1 = form.get("exercise.md") ?? form.get("exerciseMd") ?? form.get("file1");
    const f2 = form.get("steps.json") ?? form.get("stepsJson") ?? form.get("file2");
    const f3 = form.get("reference.py") ?? form.get("referenceSolution");
    if (f1 instanceof File) exerciseMd = await f1.text();
    else if (typeof f1 === "string") exerciseMd = f1;
    if (f2 instanceof File) stepsJson = await f2.text();
    else if (typeof f2 === "string") stepsJson = f2;
    if (f3 instanceof File) referenceSolution = await f3.text();
    else if (typeof f3 === "string") referenceSolution = f3;
  } else {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON ou multipart attendu" }, { status: 400, headers });
    }
    const b = body as { exerciseMd?: string; exercise_md?: string; stepsJson?: string; steps_json?: string; referenceSolution?: string };
    exerciseMd = b.exerciseMd ?? b.exercise_md ?? null;
    stepsJson = b.stepsJson ?? b.steps_json ?? null;
    referenceSolution = b.referenceSolution ?? null;
  }

  if (!exerciseMd || !stepsJson) {
    return NextResponse.json({ error: "Deux fichiers requis: exercise.md et steps.json (voir addendum §5)" }, { status: 400, headers });
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
    // Simple frontmatter parse: ---\nkey: value\n---\n# Statement...
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
      // Extract ## Examples and ## Constraints if present in markdown
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
      // Try to extract Input/Output blocks from statement
      const { extractExamples, extractIOSpec } = await import("@/lib/exercise/parser");
      examples = extractExamples(statement);
      ioSpec = extractIOSpec(statement);
    }
  } catch (e) {
    return NextResponse.json({ error: `Erreur parsing exercise.md: ${e instanceof Error ? e.message : String(e)}` }, { status: 400, headers });
  }

  // Parse steps.json
  let steps: Step[];
  try {
    const parsed = JSON.parse(stepsJson);
    const arr = Array.isArray(parsed) ? parsed : (parsed.steps ?? []);
    if (!Array.isArray(arr) || arr.length < 1 || arr.length > 7) throw new Error("steps.json doit contenir 1-7 steps");
    // Validate each step against Step schema (reuse isValidStep from manual route)
    for (const s of arr) {
      if (!s.title || typeof s.order !== "number" || !s.check_type) throw new Error(`step invalide: ${JSON.stringify(s).slice(0, 100)}`);
      if (!["io_test", "function_test", "ast_check"].includes(s.check_type)) throw new Error(`check_type invalide: ${s.check_type}`);
    }
    steps = arr as Step[];
  } catch (e) {
    return NextResponse.json({ error: `Erreur parsing steps.json: ${e instanceof Error ? e.message : String(e)}` }, { status: 400, headers });
  }

  // If reference provided, re-run verification (addendum §5)
  let reference_verified = false;
  let warning: string | null = null;
  if (referenceSolution && referenceSolution.trim()) {
    try {
      const { verifyStepPlan } = await import("@/lib/exercise/stepVerification");
      const ver = await verifyStepPlan(referenceSolution, steps as Step[]);
      if (!ver.ok) {
        warning = `Vérification échouée à "${ver.failedStep?.title}": ${ver.reason}`;
        reference_verified = false;
      } else {
        reference_verified = true;
      }
    } catch (e) {
      warning = `Vérification échouée: ${e instanceof Error ? e.message : String(e)}`;
    }
  } else {
    warning = "Aucune solution de référence fournie — publié avec reference_verified:false (addendum 3.1.2).";
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
    steps: steps as Step[],
    hidden_tests,
    visible_tests,
    visibility: "code_only",
    created_via: "upload",
    reference_verified,
    reference_solution: referenceSolution,
  });

  return NextResponse.json({ ok: true, exercise: ex, warning }, { status: 201, headers });
}
