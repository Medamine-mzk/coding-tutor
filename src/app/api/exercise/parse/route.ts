import { NextRequest, NextResponse } from "next/server";
import { isExerciseLike, detectLanguage, sanitizeForLLM } from "@/lib/exercise/parser";
import { parseExerciseWithLLM } from "@/lib/exercise/llm";

// Simple in-memory rate limit per IP (MVP, resets on restart)
const RATE_LIMIT = new Map<string, { count: number; resetAt: number }>();
const RATE_MAX = 20; // per minute
const RATE_WINDOW_MS = 60_000;

function getIP(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = RATE_LIMIT.get(ip);
  if (!entry || now > entry.resetAt) {
    RATE_LIMIT.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_MAX) return false;
  entry.count += 1;
  return true;
}

export async function POST(req: NextRequest) {
  const ip = getIP(req);
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Trop de requêtes. Réessaie dans une minute." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête JSON invalide" }, { status: 400 });
  }

  const { text, source } = body as { text?: unknown; source?: unknown };
  if (typeof text !== "string") {
    return NextResponse.json({ error: "Champ 'text' requis (string)" }, { status: 400 });
  }

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return NextResponse.json({ error: "Texte vide" }, { status: 400 });
  }
  if (trimmed.length > 8000) {
    return NextResponse.json({ error: "Texte trop long (max 8000 caractères)" }, { status: 400 });
  }
  if (trimmed.length < 10) {
    return NextResponse.json({ isExercise: false, clarification: "Texte trop court pour être un exercice. Peux-tu coller l'énoncé complet ?", detectedLanguage: detectLanguage(trimmed) }, { status: 200 });
  }

  // Treat raw as untrusted — sanitize length already. Do not evaluate any instructions inside text.
  void sanitizeForLLM(trimmed);

  // Fast path: if clearly not an exercise, return clarification without LLM
  if (!isExerciseLike(trimmed)) {
    const lang = detectLanguage(trimmed);
    const clarification =
      lang === "ar"
        ? "هذا لا يبدو كتمرين برمجة. الصق نص التمرين كاملا (البيان، المدخلات، المخرجات، الأمثلة)."
        : lang === "en"
          ? "This does not look like a programming exercise. Please paste the full statement (description, input/output, examples)."
          : "Ceci ne ressemble pas à un exercice de programmation. Colle l'énoncé complet (description, entrées/sorties, exemples).";
    return NextResponse.json({ isExercise: false, clarification, detectedLanguage: lang }, { status: 200 });
  }

  try {
    const exercise = await parseExerciseWithLLM({
      text: trimmed,
      source: (source as "typed" | "upload" | "library") ?? "typed",
    });
    return NextResponse.json({ isExercise: true, exercise }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Erreur lors de l'analyse de l'exercice", detail: msg }, { status: 500 });
  }
}

// Health for testing
export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST {text} to parse" });
}
