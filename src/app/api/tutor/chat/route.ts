import { NextRequest } from "next/server";
import { buildSystemPrompt, buildUserMessage, cannedFallback } from "@/lib/tutor/prompt";
import { allowedLevelForRequest, clampHintLevel, isHintRequestOffTopic } from "@/lib/tutor/hintLadder";
import type { ChatRequest, HintLevel, TutorContext } from "@/lib/tutor/types";

const RATE = new Map<string, { count: number; resetAt: number }>();
const RATE_MAX = 15;
const RATE_WINDOW = 60_000;

function getIP(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function checkRate(ip: string): boolean {
  const now = Date.now();
  const e = RATE.get(ip);
  if (!e || now > e.resetAt) {
    RATE.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (e.count >= RATE_MAX) return false;
  e.count += 1;
  return true;
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
  if (!checkRate(ip)) {
    const locale = "fr";
    const text = cannedFallback(0, locale, { exercise: { id: "unknown", title: "", statement: "", ioSpec: "", constraints: [], examples: [], concepts: [], milestones: [] }, code: "", hintHistory: [], locale } as unknown as TutorContext, "rate_limit");
    return new Response(chunkResponse(text, 0), {
      status: 429,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        "x-hint-level": "0",
      },
    });
  }

  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return new Response(JSON.stringify({ error: "JSON invalide" }), { status: 400, headers: { "content-type": "application/json" } });
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
      headers: { "content-type": "text/event-stream", "x-hint-level": String(allowed) },
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

  const system = buildSystemPrompt(allowed, locale);
  const userMessage = buildUserMessage(ctx, studentMessage || (quickAction ? `Quick action: ${quickAction}` : undefined), quickAction);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.TUTOR_MODEL ?? "claude-sonnet-4-20250514";

  if (!apiKey) {
    const text = cannedFallback(allowed, locale, ctx, "no_key");
    return new Response(chunkResponse(text, allowed), {
      headers: { "content-type": "text/event-stream", "x-hint-level": String(allowed) },
    });
  }

  // Try Anthropic streaming
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        stream: true,
        system,
        messages: [{ role: "user", content: userMessage }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!anthropicRes.ok || !anthropicRes.body) {
      const text = cannedFallback(allowed, locale, ctx, "error");
      return new Response(chunkResponse(text, allowed), {
        headers: { "content-type": "text/event-stream", "x-hint-level": String(allowed) },
      });
    }

    // Proxy Anthropic SSE to our own SSE format {delta, done, hintLevelUsed}
    const upstream = anthropicRes.body;
    const transform = new TransformStream<Uint8Array, Uint8Array>({
      async transform(chunk, controller) {
        const txt = new TextDecoder().decode(chunk);
        // Anthropic streams lines like `data: {"type":"content_block_delta", "delta":{"text":"..."}}`
        for (const line of txt.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;
          try {
            const evt = JSON.parse(jsonStr) as { type?: string; delta?: { text?: string }; text?: string };
            let delta = "";
            if (evt.type === "content_block_delta" && evt.delta?.text) delta = evt.delta.text;
            else if (typeof evt.text === "string") delta = evt.text;
            else if (typeof (evt as unknown as { delta?: string }).delta === "string") delta = (evt as unknown as { delta: string }).delta;
            if (delta) {
              const out = `data: ${JSON.stringify({ delta, done: false })}\n\n`;
              controller.enqueue(new TextEncoder().encode(out));
            }
          } catch {
            // ignore parse errors for non-JSON lines
          }
        }
      },
      flush(controller) {
        const out = `data: ${JSON.stringify({ delta: "", done: true, hintLevelUsed: allowed })}\n\n`;
        controller.enqueue(new TextEncoder().encode(out));
      },
    });

    return new Response(upstream.pipeThrough(transform), {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "x-hint-level": String(allowed),
      },
    });
  } catch {
    const text = cannedFallback(allowed, locale, ctx, "offline");
    return new Response(chunkResponse(text, allowed), {
      headers: { "content-type": "text/event-stream", "x-hint-level": String(allowed) },
    });
  }
}

export async function GET() {
  return new Response(JSON.stringify({ ok: true, hint: "POST to chat" }), { headers: { "content-type": "application/json" } });
}
