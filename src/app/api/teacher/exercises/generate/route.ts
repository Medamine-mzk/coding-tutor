import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/teacher/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { isExerciseLike, detectLanguage, sanitizeForLLM } from "@/lib/exercise/parser";
import { createOrReuseExercise } from "@/lib/exercise/exerciseService";
import { embeddingIndex, exampleSignature } from "@/lib/exercise/exerciseCache";
import { executionVerifiedMatch } from "@/lib/exercise/exerciseCache";
import { listTeacherExercisesByTeacher } from "@/lib/teacher/store";

const RATE_MAX = 10;
const RATE_WINDOW_MS = 60_000;

function getIP(req: NextRequest): string {
  const f = req.headers.get("x-forwarded-for");
  if (f) return f.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

// POST /api/teacher/exercises/generate — LLM-assisted draft (addendum §3.1.3 + §4)
// Reuses Stage A→B pipeline as-is, but returns a draft for teacher review, not auto-publish.
// Also runs the cache matcher as suggest-only (never auto-merge across teachers).
export async function POST(req: NextRequest) {
  const auth = requireTeacher(req);
  if ("error" in auth) return auth.error;

  const ip = getIP(req);
  const rate = checkRateLimit("teacher-generate", ip, RATE_MAX, RATE_WINDOW_MS);
  const headers = rateLimitHeaders(rate.remaining, rate.resetAt, RATE_MAX);
  if (!rate.allowed) return NextResponse.json({ error: "Trop de requêtes" }, { status: 429, headers });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400, headers });
  }

  const { text, source } = body as { text?: string; source?: string };
  if (!text || typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "text requis" }, { status: 400, headers });
  }

  const trimmed = text.trim();
  if (trimmed.length > 8000) return NextResponse.json({ error: "Texte trop long (8000)" }, { status: 400, headers });
  void sanitizeForLLM(trimmed);

  const hasLLM = !!process.env.GEMINI_API_KEY || !!process.env.GROQ_API_KEY || !!process.env.ANTHROPIC_API_KEY;
  if (!isExerciseLike(trimmed) && !hasLLM) {
    const lang = detectLanguage(trimmed);
    return NextResponse.json({ error: "Texte ne ressemble pas à un exercice", detectedLanguage: lang }, { status: 400, headers });
  }

  // Suggest-only cache: check for similar exercises in own library and public library
  // Never auto-merge — just suggest
  let suggestions: Array<{ id: string; code: string; title: string; teacher: string; match: string }> = [];
  try {
    const { buildExerciseFromHeuristics } = await import("@/lib/exercise/parser");
    const provisional = buildExerciseFromHeuristics(trimmed, "typed");
    const candidates = embeddingIndex.search(trimmed, 5);
    for (const { exercise: cand } of candidates) {
      const ok = await executionVerifiedMatch(cand, provisional.examples);
      if (ok) {
        // Find teacher exercise that corresponds to this canonical
        const allTeacherEx = listTeacherExercisesByTeacher(auth.teacher.id);
        const match = allTeacherEx.find((te) => te.canonical_id === cand.id || te.title === cand.languages[Object.keys(cand.languages)[0]]?.title);
        suggestions.push({
          id: cand.id,
          code: match?.code ?? cand.id.slice(0, 8),
          title: cand.languages[Object.keys(cand.languages)[0]]?.title ?? cand.id,
          teacher: match ? "Votre bibliothèque" : "Bibliothèque publique",
          match: "execution_verified",
        });
        if (suggestions.length >= 3) break;
      }
    }
  } catch {}

  // Also check own exercises by title similarity (simple, no embedding)
  try {
    const own = listTeacherExercisesByTeacher(auth.teacher.id);
    const lower = trimmed.toLowerCase().slice(0, 100);
    for (const ex of own) {
      if (ex.title.toLowerCase().includes(lower.slice(0, 20)) || lower.includes(ex.title.toLowerCase().slice(0, 20))) {
        if (!suggestions.find((s) => s.id === ex.id)) {
          suggestions.push({ id: ex.id, code: ex.code, title: ex.title, teacher: "Votre bibliothèque", match: "title" });
        }
      }
    }
  } catch {}

  // Run the existing pipeline as draft — reuse createOrReuseExercise but don't publish (no code yet)
  // We want the full verified exercise + steps, but as a draft for review
  const wantsSSE = req.headers.get("accept")?.includes("text/event-stream") || (body as { stream?: boolean }).stream === true;
  const onProgress = wantsSSE
    ? (ev: { stage: string; status: string; progress: number; mode?: string; label?: string }) => {
        // Will be sent via SSE below
      }
    : undefined;

  if (wantsSSE) {
    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const send = (event: string, data: unknown) => controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        const progressCb = (ev: { stage: string; status: string; progress: number; mode?: string; provider?: string; label?: string }) => send("progress", ev);
        try {
          send("progress", { stage: "parse", status: "start", progress: 5, label: "Analyse de l'énoncé" });
          const result = await createOrReuseExercise(trimmed, {
            source: (source as "typed" | "upload" | "library") ?? "typed",
            uiLocale: detectLanguage(trimmed),
            currentStepOrder: 1,
            onProgress: progressCb as never,
          });
          if ((result as { isExercise?: boolean }).isExercise === false) {
            const r = result as { isExercise: false; clarification: string; detectedLanguage: string };
            send("done", { isExercise: false, clarification: r.clarification, detectedLanguage: r.detectedLanguage, suggestions });
            controller.close();
            return;
          }
          // For draft, we want the exercise but not yet assigned a code — return it as draft
          const r = result as { exercise: import("@/lib/exercise/types").Exercise; canonical?: { id: string }; meta?: unknown; matchMethod?: string };
          // Convert canonical steps to draft steps for teacher review
          send("progress", { stage: "done", status: "done", progress: 100, label: "Brouillon prêt" });
          send("done", {
            isExercise: true,
            draft: r.exercise,
            canonicalId: r.canonical?.id,
            meta: (r as unknown as { meta?: unknown }).meta,
            suggestions,
            matchMethod: r.matchMethod,
          });
        } catch (e) {
          send("error", { error: e instanceof Error ? e.message : String(e) });
        } finally {
          controller.close();
        }
      },
    });
    return new NextResponse(stream, {
      headers: { ...headers, "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
    });
  }

  // Non-SSE fallback
  try {
    const result = await createOrReuseExercise(trimmed, {
      source: (source as "typed" | "upload" | "library") ?? "typed",
      uiLocale: detectLanguage(trimmed),
      currentStepOrder: 1,
    });
    if ((result as { isExercise?: boolean }).isExercise === false) {
      const r = result as { isExercise: false; clarification: string; detectedLanguage: string };
      return NextResponse.json({ isExercise: false, clarification: r.clarification, detectedLanguage: r.detectedLanguage, suggestions }, { headers });
    }
    const r = result as { exercise: import("@/lib/exercise/types").Exercise; canonical?: { id: string }; meta?: unknown; matchMethod?: string };
    return NextResponse.json(
      {
        isExercise: true,
        draft: r.exercise,
        canonicalId: r.canonical?.id,
        meta: (r as unknown as { meta?: unknown }).meta,
        suggestions,
        matchMethod: r.matchMethod,
      },
      { headers }
    );
  } catch (e) {
    return NextResponse.json({ error: "Erreur génération", detail: e instanceof Error ? e.message : String(e) }, { status: 500, headers });
  }
}
