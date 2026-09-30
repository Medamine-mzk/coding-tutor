export type DryRunExample = { input: string; output: string };

export type DryRunResult = {
  ok: boolean;
  provider: string;
  perExample: Array<{ input: string; expected: string; predicted: string; match: boolean }>;
};

/** Thrown when no LLM key is configured or all providers fail — no verdict. */
export class DryRunUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DryRunUnavailable";
  }
}

/** True when the reference needs third-party modules (numpy…) that free
 * remote sandboxes don't provide — skip straight to LLM dry-run. */
export function needsThirdPartyModules(code: string): boolean {
  return /(^\s*|\n\s*)(import|from)\s+(numpy|pandas|matplotlib|scipy|sklearn|sympy|pillow|PIL)\b/i.test(code);
}

async function callLlmJson(system: string, user: string, timeoutMs: number): Promise<{ text: string; provider: string }> {
  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!groqKey && !geminiKey && !anthropicKey) throw new DryRunUnavailable("No LLM key configured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (groqKey) {
      try {
        const model = process.env.GROQ_MODEL ?? process.env.TUTOR_MODEL ?? "qwen/qwen3.8-27b";
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${groqKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            model,
            temperature: 0,
            max_tokens: 1500,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
          }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Groq ${res.status}`);
        const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
        const text = data.choices?.[0]?.message?.content ?? "";
        if (text) return { text, provider: "groq" };
        throw new Error("Groq empty response");
      } catch (e) {
        console.warn("[dryrun] Groq failed, falling back:", e instanceof Error ? e.message : String(e));
      }
    }
    if (geminiKey) {
      try {
        const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: system }] },
              contents: [{ role: "user", parts: [{ text: `${system}\n\n${user}` }] }],
              generationConfig: { temperature: 0, maxOutputTokens: 1500 },
            }),
            signal: controller.signal,
          }
        );
        if (!res.ok) throw new Error(`Gemini ${res.status}`);
        const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        if (text) return { text, provider: "gemini" };
        throw new Error("Gemini empty response");
      } catch (e) {
        console.warn("[dryrun] Gemini failed, falling back:", e instanceof Error ? e.message : String(e));
      }
    }
    if (anthropicKey && anthropicKey !== "sk-ant-placeholder") {
      const model = process.env.TUTOR_MODEL ?? process.env.PARSE_MODEL ?? "claude-sonnet-4-20250514";
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": anthropicKey, "content-type": "application/json", "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: 1500, system, messages: [{ role: "user", content: user }] }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Anthropic ${res.status}`);
      const data = (await res.json()) as { content: Array<{ type: string; text: string }> };
      const text = data.content?.find((c) => c.type === "text")?.text ?? "";
      if (text) return { text, provider: "anthropic" };
      throw new Error("Anthropic empty response");
    }
    throw new DryRunUnavailable("All LLM providers failed");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * LLM "mental execution": the model predicts each example's stdout and WE
 * compare against expected server-side (the model never renders the verdict).
 * Semantic check only — results are labeled `llm_dryrun`, never `local/remote`.
 */
export async function dryRunVerify(
  referenceCode: string,
  examples: DryRunExample[],
  opts: { timeoutMs?: number } = {}
): Promise<DryRunResult> {
  if (!referenceCode.trim() || examples.length === 0) throw new DryRunUnavailable("Nothing to verify");
  const system =
    "You are a precise Python interpreter. The program below is a simple Tunisian BAC-level script " +
    "(input()/print(), loops, conditions, maybe numpy arrays). For EACH example input, simulate the execution " +
    "exactly and output ONLY what the program would print to stdout (exact text, line breaks preserved). " +
    "Each input() call reads the next line of the example input. Respond with JSON only, no explanation.";
  const user =
    `Program:\n\`\`\`python\n${referenceCode}\n\`\`\`\n\n` +
    `Examples (index, stdin):\n${examples.map((e, i) => `#${i}\n${e.input}`).join("\n---\n")}\n\n` +
    `Respond with JSON only: {"outputs": ["<exact stdout for #0>", "<exact stdout for #1>", ...]}`;

  const { text, provider } = await callLlmJson(system, user, opts.timeoutMs ?? 15000);
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new DryRunUnavailable("No JSON in LLM response");
  let predicted: string[];
  try {
    const parsed = JSON.parse(match[0]) as { outputs?: unknown };
    if (!Array.isArray(parsed.outputs) || !parsed.outputs.every((o) => typeof o === "string")) {
      throw new Error("bad schema");
    }
    predicted = parsed.outputs as string[];
  } catch {
    throw new DryRunUnavailable("Unparseable LLM response");
  }

  const perExample = examples.map((e, i) => {
    const pred = (predicted[i] ?? "").trim();
    return { input: e.input, expected: e.output.trim(), predicted: pred, match: pred === e.output.trim() };
  });
  return { ok: perExample.length > 0 && perExample.every((p) => p.match), provider, perExample };
}
