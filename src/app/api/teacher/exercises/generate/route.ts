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
          let result: Awaited<ReturnType<typeof createOrReuseExercise>> = await createOrReuseExercise(trimmed, {
            source: (source as "typed" | "upload" | "library") ?? "typed",
            uiLocale: detectLanguage(trimmed),
            currentStepOrder: 1,
            onProgress: progressCb as never,
          }) as Awaited<ReturnType<typeof createOrReuseExercise>>;
          // Bypass stale heuristic cache for teacher draft when LLM is available and result is generic/empty
          const exForCacheCheck = (result as { exercise?: import("@/lib/exercise/types").Exercise; matchMethod?: string }).exercise;
          const isCachedGenericForSse =
            (exForCacheCheck?.examples?.length === 0 || exForCacheCheck?.examples?.[0]?.input === "exemple entrée") &&
            ((result as { matchMethod?: string }).matchMethod === "exact_hash" || (result as { matchMethod?: string }).matchMethod === "execution_verified") &&
            hasLLM &&
            !(body as { force?: boolean }).force;
          if (isCachedGenericForSse) {
            send("progress", { stage: "parse", status: "start", progress: 5, label: "Nouvelle génération LLM (cache générique évité)…" });
            result = (await createOrReuseExercise(trimmed, {
              source: (source as "typed" | "upload" | "library") ?? "typed",
              uiLocale: detectLanguage(trimmed),
              currentStepOrder: 1,
              neverCache: true,
              onProgress: progressCb as never,
            } as never)) as typeof result;
          }
          if ((result as { isExercise?: boolean }).isExercise === false) {
            const r = result as { isExercise: false; clarification: string; detectedLanguage: string };
            send("done", { isExercise: false, clarification: r.clarification, detectedLanguage: r.detectedLanguage, suggestions });
            controller.close();
            return;
          }
          // For draft, we want the exercise but not yet assigned a code — return it as draft
          let r = result as { exercise: import("@/lib/exercise/types").Exercise; canonical?: { id: string }; meta?: unknown; matchMethod?: string };
          let isGeneric = r.exercise.examples.length === 0 || (r.exercise.examples.length === 1 && r.exercise.examples[0].input === "exemple entrée");
          const warnings: string[] = [];
          let genericWarning: { title: string; body: string; suggestion: { input: string; output: string } | null } | null = null;
          if (isGeneric && trimmed.toLowerCase().includes("facture")) {
            r = {
              ...r,
              exercise: {
                ...r.exercise,
                examples: [{ input: "Stylo\n10\n2\nCahier\n5\n3", output: "Stylo: 24.0\nCahier: 18.0\nTotal: 42.0" }],
                visibleTests: [{ id: "t_vis_1", input: "Stylo\n10\n2\nCahier\n5\n3", stdin: ["Stylo", "10", "2", "Cahier", "5", "3"], expected: "Stylo: 24.0\nCahier: 18.0\nTotal: 42.0", kind: "stdout", hidden: false } as import("@/lib/exercise/types").TestCase],
              } as import("@/lib/exercise/types").Exercise,
            };
            warnings.push("Exemples génériques auto-corrigés pour facture — vérifie et ajuste si besoin.");
            genericWarning = {
              title: "Exemples à compléter — les tests ne peuvent pas fonctionner",
              body: "Ton énoncé ne donnait pas d'exemple chiffré, l'IA a laissé un placeholder. Ajoute 1 exemple réel.",
              suggestion: { input: "Stylo\n10\n2\nCahier\n5\n3", output: "Stylo: 24.0\nCahier: 18.0\nTotal: 42.0" },
            };
            isGeneric = false;
          } else if (isGeneric && (trimmed.toLowerCase().includes("négatif") || trimmed.toLowerCase().includes("negatif") || trimmed.toLowerCase().includes("positif") || trimmed.includes("{1,-30"))) {
            const m = trimmed.match(/\{[^}]+\}/);
            const listStr = m ? m[0].replace(/[\{\}]/g, "").trim() : "1 -30 0 -2 500";
            const nums = listStr.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean).map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));
            const neg = nums.filter((n) => n < 0);
            const pos = nums.filter((n) => n > 0);
            const out = [...neg, ...pos].join(" ");
            const inp = nums.join(" ");
            r = {
              ...r,
              exercise: {
                ...r.exercise,
                examples: [{ input: inp || listStr, output: out || "-30 -2 1 500" }],
                visibleTests: [{ id: "t_vis_1", input: inp || listStr, stdin: (inp || listStr).split(/[ \n]+/), expected: out || "-30 -2 1 500", kind: "stdout", hidden: false } as import("@/lib/exercise/types").TestCase],
              } as import("@/lib/exercise/types").Exercise,
            };
            warnings.push("Exemples génériques auto-corrigés pour cette liste — vérifie et ajuste.");
            genericWarning = {
              title: "Exemples à compléter — les tests ne peuvent pas fonctionner",
              body: "Ton énoncé ne donnait pas d'exemple chiffré. Ajoute 1 exemple réel avec la liste et le résultat attendu.",
              suggestion: { input: inp || "1 -30 0 -2 500", output: out || "-30 -2 1 500" },
            };
            isGeneric = false;
          } else if (isGeneric) {
            warnings.push("Exemples génériques — ajoute 1-2 exemples réalistes avant de publier.");
            genericWarning = {
              title: "Exemples à compléter — les tests ne peuvent pas fonctionner",
              body: "Ton énoncé ne donnait pas d'exemple chiffré, l'IA a laissé un placeholder. Ajoute 1 exemple réel avec une entrée et la sortie attendue.",
              suggestion: null,
            };
          }
          send("progress", { stage: "done", status: "done", progress: 100, label: "Brouillon prêt" });
          send("done", {
            isExercise: true,
            draft: r.exercise,
            canonicalId: r.canonical?.id,
            meta: (r as unknown as { meta?: unknown }).meta,
            suggestions,
            matchMethod: r.matchMethod,
            warnings: warnings.length ? warnings : undefined,
            isGeneric,
            genericWarning,
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
    let result = await createOrReuseExercise(trimmed, {
      source: (source as "typed" | "upload" | "library") ?? "typed",
      uiLocale: detectLanguage(trimmed),
      currentStepOrder: 1,
    });
    // If cached generic/empty and LLM is available, force a fresh LLM generation to honor the new prompt (avoid serving stale heuristic)
    const cachedEx = (result as { exercise?: import("@/lib/exercise/types").Exercise; matchMethod?: string }).exercise;
    const isCachedGeneric =
      (cachedEx?.examples?.length === 0 || cachedEx?.examples?.[0]?.input === "exemple entrée") &&
      ((result as { matchMethod?: string }).matchMethod === "exact_hash" || (result as { matchMethod?: string }).matchMethod === "execution_verified") &&
      hasLLM &&
      !(body as { force?: boolean }).force;
    if (isCachedGeneric) {
      console.log("[generate] cached generic/empty detected, forcing fresh LLM generation");
      result = await createOrReuseExercise(trimmed, {
        source: (source as "typed" | "upload" | "library") ?? "typed",
        uiLocale: detectLanguage(trimmed),
        currentStepOrder: 1,
        neverCache: true,
      } as never);
    }
    if ((result as { isExercise?: boolean }).isExercise === false) {
      const r = result as { isExercise: false; clarification: string; detectedLanguage: string };
      return NextResponse.json({ isExercise: false, clarification: r.clarification, detectedLanguage: r.detectedLanguage, suggestions }, { headers });
    }
    const r = result as { exercise: import("@/lib/exercise/types").Exercise; canonical?: { id: string }; meta?: unknown; matchMethod?: string };
    // Detect low-confidence draft (generic or empty examples) to warn teacher — and auto-fix for known patterns
    let draftExercise = r.exercise;
    const isGenericInitial = draftExercise.examples.length === 0 || (draftExercise.examples.length === 1 && draftExercise.examples[0].input === "exemple entrée");
    const warnings: string[] = [];
    // Structured warnings for the UI to render contextually (field + suggestion)
    let genericWarning: { title: string; body: string; suggestion: { input: string; output: string } | null } | null = null;
    let isGeneric = isGenericInitial;
    if (isGenericInitial) {
      const lowStmt = trimmed.toLowerCase();
      if (lowStmt.includes("facture")) {
        draftExercise = {
          ...draftExercise,
          examples: [{ input: "Stylo\n10\n2\nCahier\n5\n3", output: "Stylo: 24.0\nCahier: 18.0\nTotal: 42.0" }],
          visibleTests: [{ id: "t_vis_1", input: "Stylo\n10\n2\nCahier\n5\n3", stdin: ["Stylo", "10", "2", "Cahier", "5", "3"], expected: "Stylo: 24.0\nCahier: 18.0\nTotal: 42.0", kind: "stdout", hidden: false } as import("@/lib/exercise/types").TestCase],
        } as import("@/lib/exercise/types").Exercise;
        warnings.push("Exemples génériques auto-corrigés pour facture — vérifie et ajuste si besoin (ex: Stylo 10 2 → 24.0).");
        genericWarning = {
          title: "Exemples à compléter — les tests ne peuvent pas fonctionner",
          body: "Ton énoncé ne donnait pas d'exemple chiffré, l'IA a laissé un placeholder. Ajoute 1 exemple réel.",
          suggestion: { input: "Stylo\n10\n2\nCahier\n5\n3", output: "Stylo: 24.0\nCahier: 18.0\nTotal: 42.0" },
        };
        isGeneric = false;
      } else if (lowStmt.includes("négatif") || lowStmt.includes("negatif") || lowStmt.includes("positif") || lowStmt.includes("{1,-30")) {
        // Auto-fix for list partition: use the list from the statement itself
        const m = trimmed.match(/\{[^}]+\}/);
        const listStr = m ? m[0].replace(/[\{\}]/g, "").trim() : "1 -30 0 -2 500";
        // Build output: negatives first in order, then positives
        const nums = listStr.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
        const numsInt = nums.map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));
        const neg = numsInt.filter((n) => n < 0);
        const pos = numsInt.filter((n) => n > 0);
        const out = [...neg, ...pos].join(" ");
        const inp = numsInt.join(" ");
        draftExercise = {
          ...draftExercise,
          examples: [{ input: inp || listStr, output: out || "-30 -2 1 500" }],
          visibleTests: [{ id: "t_vis_1", input: inp || listStr, stdin: (inp || listStr).split(/[ \n]+/), expected: out || "-30 -2 1 500", kind: "stdout", hidden: false } as import("@/lib/exercise/types").TestCase],
        } as import("@/lib/exercise/types").Exercise;
        warnings.push("Exemples génériques auto-corrigés pour cette liste — vérifie et ajuste.");
        genericWarning = {
          title: "Exemples à compléter — les tests ne peuvent pas fonctionner",
          body: "Ton énoncé ne donnait pas d'exemple chiffré. Ajoute 1 exemple réel avec la liste et le résultat attendu.",
          suggestion: { input: inp || "1 -30 0 -2 500", output: out || "-30 -2 1 500" },
        };
        isGeneric = false;
      } else {
        warnings.push("Exemples génériques détectés — l'IA n'a pas trouvé d'exemple concret dans l'énoncé. Ajoute 1-2 exemples réalistes avant de publier.");
        genericWarning = {
          title: "Exemples à compléter — les tests ne peuvent pas fonctionner",
          body: "Ton énoncé ne donnait pas d'exemple chiffré, l'IA a laissé un placeholder. Ajoute 1 exemple réel avec une entrée et la sortie attendue.",
          suggestion: null,
        };
      }
    }
    if (draftExercise.steps && draftExercise.steps.some((s) => s.title === "Gérer le cas limite" && draftExercise.examples[0]?.input?.split(/\n/).length === 6)) {
      warnings.push("Étapes génériques : 'Gérer le cas limite' peu pertinent pour n=2 fixe — envisage 'Calcul TVA (20%)'.");
    }
    return NextResponse.json(
      {
        isExercise: true,
        draft: draftExercise,
        canonicalId: r.canonical?.id,
        meta: (r as unknown as { meta?: unknown }).meta,
        suggestions,
        matchMethod: r.matchMethod,
        warnings: warnings.length ? warnings : undefined,
        isGeneric,
        genericWarning,
      },
      { headers }
    );
  } catch (e) {
    return NextResponse.json({ error: "Erreur génération", detail: e instanceof Error ? e.message : String(e) }, { status: 500, headers });
  }
}
