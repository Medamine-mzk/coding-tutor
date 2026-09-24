import { NextRequest } from "next/server";
import { buildSystemPrompt, buildUserMessage, cannedFallback } from "@/lib/tutor/prompt";
import { allowedLevelForRequest, clampHintLevel, isHintRequestOffTopic } from "@/lib/tutor/hintLadder";
import type { ChatRequest, HintLevel, TutorContext } from "@/lib/tutor/types";
import { checkForLeak, logBlockedLeak } from "@/lib/tutor/antiLeak";
import type { TestCase } from "@/lib/exercise/types";
import { generateHeuristicReference } from "@/lib/exercise/reference";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { reportError } from "@/lib/monitoring";

const RATE_MAX = 15;
const RATE_WINDOW = 60_000;

function getIP(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function chunkResponse(text: string, hintLevel: HintLevel): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const words = text.split(/(\s+)/);
  let i = 0;
  return new ReadableStream({
    async pull(controller) {
      if (i >= words.length) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ delta: "", done: true, hintLevelUsed: hintLevel })}\n\n`));
        controller.close();
        return;
      }
      const delta = words[i++] ?? "";
      controller.enqueue(enc.encode(`data: ${JSON.stringify({ delta, done: false })}\n\n`));
      // small delay to simulate streaming
      await new Promise((r) => setTimeout(r, 12));
    },
  });
}

export async function POST(req: NextRequest) {
  const ip = getIP(req);
  const rate = checkRateLimit("tutor", ip, RATE_MAX, RATE_WINDOW);
  const rateHeaders = rateLimitHeaders(rate.remaining, rate.resetAt, RATE_MAX);
  if (!rate.allowed) {
    const locale = "fr";
    const text = cannedFallback(0, locale, { exercise: { id: "unknown", title: "", statement: "", ioSpec: "", constraints: [], examples: [], concepts: [], milestones: [] }, code: "", hintHistory: [], locale } as unknown as TutorContext, "rate_limit");
    return new Response(chunkResponse(text, 0), {
      status: 429,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        "x-hint-level": "0",
        ...rateHeaders,
      },
    });
  }

  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch (e: unknown) {
    reportError(e, "tutor: invalid JSON");
    return new Response(JSON.stringify({ error: "JSON invalide" }), { status: 400, headers: { "content-type": "application/json", ...rateHeaders } });
  }

  const locale = (body.locale === "ar" || body.locale === "en" ? body.locale : "fr") as "fr" | "ar" | "en";
  const studentMessage = (body.studentMessage ?? "").slice(0, 1000);
  const quickAction = body.quickAction;
  const code = (body.code ?? "").slice(0, 8000);
  const requested = body.requestedHintLevel !== undefined ? clampHintLevel(body.requestedHintLevel) : undefined;
  const codeChanged = !!body.codeChangedSinceLastHint;
  const hasRun = !!body.hasRunSinceLastHint;
  const explicitStuck = quickAction === "stuck" || /je suis bloqu|i am stuck|انا عالق/i.test(studentMessage);

  // Off-topic / cheating attempt → stay in role, redirect, do not escalate
  if (studentMessage && isHintRequestOffTopic(studentMessage)) {
    const text =
      locale === "ar"
        ? "أفهم أنك تريد الحل، لكن هدفي أن تتعلمه بنفسك. دعنا نواصل بتلميح صغير: ماذا حدث عند آخر تنفيذ؟"
        : locale === "en"
          ? "I understand you want the answer, but my goal is for you to learn to solve it yourself. Let's continue with a small hint: what happened on your last run?"
          : "Je comprends que tu veuilles la réponse, mais mon rôle est que tu apprennes à résoudre toi-même. Continuons avec un petit indice : que s'est-il passé à ta dernière exécution ?";
    const allowed: HintLevel = allowedLevelForRequest(requested, 0, { codeChangedSinceLastHint: false, hasRunSinceLastHint: false, explicitStuck: false });
    return new Response(chunkResponse(text, allowed), {
      headers: { "content-type": "text/event-stream", "x-hint-level": String(allowed), ...rateHeaders },
    });
  }

  // Hint ladder: current is max hintHistory or 0
  const currentLevel: HintLevel = (() => {
    const hist = body.hintHistory ?? [];
    if (hist.length === 0) return 0;
    return Math.max(...hist.map((h) => h.level)) as HintLevel;
  })();

  const allowed = allowedLevelForRequest(requested, currentLevel, {
    codeChangedSinceLastHint: codeChanged,
    hasRunSinceLastHint: hasRun,
    explicitStuck,
  });

  // Assemble context for prompt
  const exercise = body.exercise ?? {
    id: body.exerciseId ?? "unknown",
    title: "Exercice",
    statement: "",
    ioSpec: "",
    constraints: [],
    examples: [],
    concepts: [],
    milestones: body.currentMilestoneTitle ? [{ title: body.currentMilestoneTitle }] : [],
  };

  const ctx: TutorContext = {
    exercise,
    code,
    lastRunResult: body.lastRunResult ?? null,
    testReport: body.testReport ?? null,
    hintHistory: (body.hintHistory ?? []).map((h) => ({ level: h.level, at: h.at })),
    currentMilestoneTitle: body.currentMilestoneTitle,
    locale,
  };

  const systemBase = buildSystemPrompt(allowed, locale);
  const userMessage = buildUserMessage(ctx, studentMessage || (quickAction ? `Quick action: ${quickAction}` : undefined), quickAction);

  // Prepare anti-leak context: tests and reference (server-only)
  const tests: TestCase[] = ((body.tests as TestCase[] | undefined) ?? []) as TestCase[];
  let referenceCode: string | undefined;
  try {
    // Build a minimal Exercise for heuristic reference generation (server-only)
    const refExercise = {
      id: exercise.id,
      language: "python" as const,
      uiLocale: locale,
      title: exercise.title,
      statement: exercise.statement,
      ioSpec: exercise.ioSpec,
      constraints: exercise.constraints,
      examples: exercise.examples,
      difficulty: 2 as const,
      concepts: exercise.concepts as unknown as import("@/lib/exercise/types").Concept[],
      source: "typed" as const,
      milestones: [],
      visibleTests: [],
      hiddenTests: [],
    } as unknown as import("@/lib/exercise/types").Exercise;
    referenceCode = generateHeuristicReference(refExercise) ?? undefined;
  } catch {}

  const groqKey = process.env.GROQ_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const hasGroq = !!groqKey;
  const hasAnthropic = !!anthropicKey;
  const groqModel = process.env.GROQ_MODEL ?? process.env.TUTOR_MODEL ?? "llama-3.1-8b-instant";
  const anthropicModel = process.env.TUTOR_MODEL ?? "claude-sonnet-4-20250514";

  async function generateOnce(attempt: number, strictNote?: string): Promise<string> {
    const system = strictNote ? `${systemBase}\n\n${strictNote}` : systemBase;
    if (!hasGroq && !hasAnthropic) {
      return cannedFallback(allowed, locale, ctx, attempt === 0 ? "no_key" : "error");
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      let textPart = "";
      if (hasGroq) {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${groqKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: groqModel,
            temperature: 0.3,
            max_tokens: 400,
            messages: [
              { role: "system", content: system },
              { role: "user", content: userMessage },
            ],
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) return cannedFallback(allowed, locale, ctx, "error");
        const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
        textPart = data.choices?.[0]?.message?.content ?? "";
      } else {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": anthropicKey!,
            "content-type": "application/json",
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: anthropicModel,
            max_tokens: 400,
            system,
            messages: [{ role: "user", content: userMessage }],
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) return cannedFallback(allowed, locale, ctx, "error");
        const data = (await res.json()) as { content: Array<{ type: string; text: string }> };
        textPart = data.content?.find((c) => c.type === "text")?.text ?? "";
      }
      return textPart.trim() || cannedFallback(allowed, locale, ctx, "error");
    } catch {
      return cannedFallback(allowed, locale, ctx, "offline");
    }
  }

  // Defense in depth: generate, check for leak, regenerate up to 2 times with stricter instruction, else canned fallback
  let finalText: string | null = null;
  let blockedReason: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const strictNote =
      attempt === 0
        ? undefined
        : attempt === 1
          ? "STRICT: Your previous response was blocked for containing too much code or a full solution. Provide ONLY a short hint. At levels <5, NEVER include a code block longer than 6 lines. At any level, never provide code that together with the student's code would pass all tests."
          : "STRICT FINAL: Provide only a Socratic question, no code block at all. Max 2 sentences.";
    const candidate = await generateOnce(attempt, strictNote);
    const check = await checkForLeak(candidate, {
      hintLevel: allowed,
      studentCode: code,
      tests,
      referenceCode,
    });
    if (!check.isLeak) {
      finalText = candidate;
      break;
    }
    blockedReason = check.reason ?? "unknown";
    logBlockedLeak({ reason: blockedReason, hintLevel: allowed, snippet: (check.offendingBlock ?? candidate).slice(0, 400) });
    if (attempt === 2) {
      // Fallback to safe canned hint after 2 regenerations
      finalText = cannedFallback(allowed, locale, ctx, "error");
      break;
    }
    // otherwise loop to regenerate with stricter instruction
  }

  const safeText = finalText ?? cannedFallback(allowed, locale, ctx, "error");
  // Ensure safeText itself is not a leak (canned is safe by design, but double-check)
  const finalCheck = await checkForLeak(safeText, { hintLevel: allowed, studentCode: code, tests, referenceCode });
  const textToStream = finalCheck.isLeak ? cannedFallback(allowed, locale, ctx, "error") : safeText;

  return new Response(chunkResponse(textToStream, allowed), {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "x-hint-level": String(allowed),
      ...(blockedReason ? { "x-blocked-reason": blockedReason } : {}),
      ...rateHeaders,
    },
  });
}

export async function GET() {
  return new Response(JSON.stringify({ ok: true, hint: "POST to chat" }), { headers: { "content-type": "application/json" } });
}
