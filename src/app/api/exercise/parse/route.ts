import { NextRequest, NextResponse } from "next/server";
import { isExerciseLike, detectLanguage, sanitizeForLLM } from "@/lib/exercise/parser";
import { parseExerciseWithLLM } from "@/lib/exercise/llm";
import { generateReferenceSolutionLLM } from "@/lib/exercise/reference";
import { validateTestsWithReference } from "@/lib/exercise/validate";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { reportError } from "@/lib/monitoring";

const RATE_MAX = 20;
const RATE_WINDOW_MS = 60_000;

function getIP(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: NextRequest) {
  const ip = getIP(req);
  const rate = checkRateLimit("parse", ip, RATE_MAX, RATE_WINDOW_MS);
  const rateHeaders = rateLimitHeaders(rate.remaining, rate.resetAt, RATE_MAX);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Trop de requêtes. Réessaie dans une minute." }, { status: 429, headers: rateHeaders });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch (e: unknown) {
    reportError(e, "parse: invalid JSON");
    return NextResponse.json({ error: "Requête JSON invalide" }, { status: 400, headers: rateHeaders });
  }

  const { text, source } = body as { text?: unknown; source?: unknown };
  if (typeof text !== "string") {
    return NextResponse.json({ error: "Champ 'text' requis (string)" }, { status: 400, headers: rateHeaders });
  }

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return NextResponse.json({ error: "Texte vide" }, { status: 400, headers: rateHeaders });
  }
  if (trimmed.length > 8000) {
    return NextResponse.json({ error: "Texte trop long (max 8000 caractères)" }, { status: 400, headers: rateHeaders });
  }
  if (trimmed.length < 10) {
    return NextResponse.json({ isExercise: false, clarification: "Texte trop court pour être un exercice. Peux-tu coller l'énoncé complet ?", detectedLanguage: detectLanguage(trimmed) }, { status: 200, headers: rateHeaders });
  }

  // Treat raw as untrusted — sanitize length already. Do not evaluate any instructions inside text.
  void sanitizeForLLM(trimmed);

  // Fast path: if clearly not an exercise and no LLM, return clarification without calling LLM
  const hasLLM = !!process.env.GROQ_API_KEY || !!process.env.ANTHROPIC_API_KEY;
  if (!isExerciseLike(trimmed) && !hasLLM) {
    const lang = detectLanguage(trimmed);
    const clarification =
      lang === "ar"
        ? "هذا لا يبدو كتمرين برمجة. الصق نص التمرين كاملا (البيان، المدخلات، المخرجات، الأمثلة)."
        : lang === "en"
          ? "This does not look like a programming exercise. Please paste the full statement (description, input/output, examples)."
          : "Ceci ne ressemble pas à un exercice de programmation. Colle l'énoncé complet (description, entrées/sorties, exemples).";
    return NextResponse.json({ isExercise: false, clarification, detectedLanguage: lang }, { status: 200, headers: rateHeaders });
  }

  try {
    const exercise = await parseExerciseWithLLM({
      text: trimmed,
      source: (source as "typed" | "upload" | "library") ?? "typed",
    });

    // Ticket 04: validate tests against server-side reference solution. Reference never reaches the browser.
    try {
      const reference = await generateReferenceSolutionLLM(exercise);
      if (reference) {
        const allTests = [...exercise.visibleTests, ...exercise.hiddenTests];
        const { kept, discarded } = await validateTestsWithReference(allTests, reference, { timeoutMs: 2000 });
        if (discarded.length > 0) {
          console.warn(`[parse] discarded ${discarded.length} tests that reference failed/mismatched:`, discarded.map((d) => `${d.test.id}:${d.reason}`).join("; "));
        }
        // Keep only tests that passed validation, preserving visible/hidden split
        const keptIds = new Set(kept.map((t) => t.id));
        exercise.visibleTests = exercise.visibleTests.filter((t) => keptIds.has(t.id));
        exercise.hiddenTests = exercise.hiddenTests.filter((t) => keptIds.has(t.id));
        // Fallback: if all visible were discarded, keep originals (don't block student)
        if (exercise.visibleTests.length === 0 && allTests.length > 0) {
          exercise.visibleTests = allTests.filter((t) => !t.hidden).slice(0, 2);
          exercise.hiddenTests = allTests.filter((t) => t.hidden).slice(0, 2);
        }
      }
    } catch (valErr) {
      console.warn("[parse] validation skipped:", valErr instanceof Error ? valErr.message : String(valErr));
    }

    return NextResponse.json({ isExercise: true, exercise }, { status: 200, headers: rateHeaders });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    reportError(e, "parse: LLM or validation");
    return NextResponse.json({ error: "Erreur lors de l'analyse de l'exercice", detail: msg }, { status: 500, headers: rateHeaders });
  }
}

// Health for testing
export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST {text} to parse" });
}
