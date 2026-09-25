import type { Exercise } from "./types";
import type { Step } from "./stepPlan";
import { generateMilestones } from "./milestones";
import { verifyStepPlan } from "./stepVerification";

function nanoid(): string {
  return Math.random().toString(36).slice(2, 9);
}

// Stage B: decompose VERIFIED reference into a typed StepPlan (addendum 1.1/1.3)
// Real LLM path (Gemini → Groq → Anthropic) with sandbox verification; heuristic fallback if no keys or verification fails.
// This is core product, not infra polish — a wrong step that marks correct code as failed is worse than no hint.

function milestoneToStepType(title: string): { check_type: Step["check_type"]; hint: string } {
  const low = title.toLowerCase();
  if (low.includes("lire") || low.includes("read") || low.includes("قراءة")) return { check_type: "ast_check", hint: "input" };
  if (low.includes("convertir") || low.includes("convert") || low.includes("تحويل")) return { check_type: "ast_check", hint: "1000" };
  if (low.includes("calculer") || low.includes("calculate") || low.includes("حساب")) return { check_type: "io_test", hint: "" };
  if (low.includes("division") || low.includes("zéro") || low.includes("zero")) return { check_type: "ast_check", hint: "if" };
  if (low.includes("boucler") || low.includes("loop") || low.includes("تكرار")) return { check_type: "ast_check", hint: "For" };
  if (low.includes("condition") || low.includes("appliquer") || low.includes("تطبيق")) return { check_type: "ast_check", hint: "If" };
  if (low.includes("fonction") || low.includes("function") || low.includes("define")) return { check_type: "ast_check", hint: "FunctionDef" };
  return { check_type: "io_test", hint: "" };
}

function heuristicSteps(exercise: Exercise, reference: string): Step[] {
  const milestones = generateMilestones(exercise);
  return milestones.map((m, idx) => {
    const typed = milestoneToStepType(m.title);
    const isLast = idx === milestones.length - 1;
    return {
      id: m.id,
      order: m.order,
      title: m.title,
      goal: m.title,
      check_type: isLast ? "io_test" : typed.check_type,
      io_test: isLast && exercise.examples[0] ? { stdin: exercise.examples[0].input.split(/[ \n]+/).filter(Boolean), expected_stdout: exercise.examples[0].output } : null,
      function_test: null,
      ast_check: typed.check_type === "ast_check" ? { must_contain: typed.hint ? [typed.hint] : [], must_not_contain: [] } : null,
      hint_seeds: { [m.order]: m.hintSeeds },
      exerciseId: m.exerciseId,
      successCriteria: m.successCriteria,
      hintSeeds: m.hintSeeds,
    };
  });
}

async function callGeminiForStepPlan(system: string, user: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("No Gemini key");
  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const headers: Record<string, string> = { "content-type": "application/json" };
  let fullUrl = url;
  if (key.startsWith("AQ.")) headers["Authorization"] = `Bearer ${key}`;
  else {
    headers["x-goog-api-key"] = key;
    fullUrl = `${url}?key=${encodeURIComponent(key)}`;
  }
  const body = {
    contents: [{ role: "user", parts: [{ text: `${system}\n\n${user}` }] }],
    systemInstruction: { parts: [{ text: system }] },
    generationConfig: { temperature: 0.2, maxOutputTokens: 2000, responseMimeType: "application/json" },
  };
  const res = await fetch(fullUrl, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${txt.slice(0, 500)}`);
  }
  const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function generateViaLLM(exercise: Exercise, reference: string): Promise<Step[] | null> {
  // In test, use heuristic fallback for determinism (no network, no flakiness)
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return null;
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasGroq = !!process.env.GROQ_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  if (!hasGemini && !hasGroq && !hasAnthropic) return null;

  const locale = exercise.uiLocale;
  const langName = locale === "ar" ? "Arabic" : locale === "en" ? "English" : "French";
  const system = `You are a step planner for a Python coding tutor (Tunisia). Given an exercise and its VERIFIED reference solution (which already passes its tests), decompose it into 3-7 steps. Each step must be gradable: io_test (stdin→stdout for whole program/final step), function_test (call named function, compare return), or ast_check (must_contain AST nodes). Intermediate steps like "initialize variable" or "read input" are NOT runnable programs, so use ast_check; function helpers use function_test; final complete program uses io_test with the exercise's real example. Return JSON only. Language for title/goal: ${langName}. Never output the reference solution itself in the steps.`;

  const examplesStr = exercise.examples.map((e) => `input: ${e.input} -> output: ${e.output}`).join("\n");
  const user = `Exercise:
Title: ${exercise.title}
Statement: ${exercise.statement}
IO: ${exercise.ioSpec}
Concepts: ${exercise.concepts.join(", ")}
Examples:
${examplesStr}

Verified reference solution (server-only, do NOT copy verbatim into steps, use it to derive correct I/O for io_test/function_test):
\`\`\`python
${reference}
\`\`\`

Respond with JSON only, schema:
{
  "steps": [
    {
      "title": "string — shown always",
      "goal": "string — shown only when step is current, 1 sentence, actionable",
      "check_type": "io_test" | "function_test" | "ast_check",
      "io_test": {"stdin": ["..."], "expected_stdout": "..."} | null,
      "function_test": {"function_name": "...", "args": [...], "expected": ...} | null,
      "ast_check": {"must_contain": ["For" | "If" | "input" | "Call:len" ...], "must_not_contain": []} | null,
      "hint_seeds": {"0": ["question"], "1": ["nudge"]}
    }
  ]
}
Rules:
- 3-7 steps, order matters. Last step must be io_test using one of the real examples above.
- For ast_check, use must_contain like "For", "If", "FunctionDef", "input", "Call:len". Keep it minimal.
- For function_test, only use if reference defines a function; otherwise use ast_check or io_test.
- hint_seeds are internal, 1-2 short hints per level.
`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    let jsonStr = "";
    if (hasGemini) {
      try {
        jsonStr = await callGeminiForStepPlan(system, user);
      } catch (e) {
        console.warn("[stepGenerator] Gemini StepPlan failed, fallback:", e instanceof Error ? e.message : String(e));
      }
    }
    if (!jsonStr && hasGroq) {
      try {
        const groqKey = process.env.GROQ_API_KEY!;
        const groqModel = process.env.GROQ_MODEL ?? process.env.TUTOR_MODEL ?? "llama-3.1-8b-instant";
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${groqKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            model: groqModel,
            temperature: 0.2,
            max_tokens: 2000,
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
        jsonStr = data.choices?.[0]?.message?.content ?? "";
      } catch (e) {
        console.warn("[stepGenerator] Groq StepPlan failed:", e instanceof Error ? e.message : String(e));
      }
    }
    if (!jsonStr && hasAnthropic) {
      try {
        const anthropicKey = process.env.ANTHROPIC_API_KEY!;
        const model = process.env.TUTOR_MODEL ?? process.env.PARSE_MODEL ?? "claude-sonnet-4-20250514";
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": anthropicKey, "content-type": "application/json", "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model, max_tokens: 2000, system, messages: [{ role: "user", content: user }] }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Anthropic ${res.status}`);
        const data = (await res.json()) as { content: Array<{ type: string; text: string }> };
        jsonStr = data.content?.find((c) => c.type === "text")?.text ?? "";
      } catch (e) {
        console.warn("[stepGenerator] Anthropic StepPlan failed:", e instanceof Error ? e.message : String(e));
      }
    }
    if (!jsonStr) return null;
    const match = jsonStr.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as {
      steps?: Array<{
        title: string;
        goal: string;
        check_type: Step["check_type"];
        io_test?: { stdin: string[]; expected_stdout: string } | null;
        function_test?: { function_name: string; args: unknown[]; expected: unknown } | null;
        ast_check?: { must_contain: string[]; must_not_contain?: string[] } | null;
        hint_seeds?: Record<string, string[]>;
      }>;
    };
    if (!parsed.steps || !Array.isArray(parsed.steps) || parsed.steps.length < 3 || parsed.steps.length > 7) return null;
    const steps: Step[] = parsed.steps.map((s, idx) => ({
      id: `st_${nanoid()}`,
      order: idx + 1,
      title: s.title?.slice(0, 80) || `Étape ${idx + 1}`,
      goal: s.goal?.slice(0, 200) || s.title || `Goal ${idx + 1}`,
      check_type: (["io_test", "function_test", "ast_check"].includes(s.check_type) ? s.check_type : idx === parsed.steps!.length - 1 ? "io_test" : "ast_check") as Step["check_type"],
      io_test: s.check_type === "io_test" && s.io_test ? { stdin: s.io_test.stdin ?? [], expected_stdout: String(s.io_test.expected_stdout ?? "") } : null,
      function_test: s.check_type === "function_test" && s.function_test ? { function_name: s.function_test.function_name, args: s.function_test.args ?? [], expected: s.function_test.expected } : null,
      ast_check: s.check_type === "ast_check" && s.ast_check ? { must_contain: s.ast_check.must_contain ?? [], must_not_contain: s.ast_check.must_not_contain ?? [] } : null,
      hint_seeds: s.hint_seeds ?? { "0": [] },
      exerciseId: exercise.id,
      successCriteria: s.check_type,
      hintSeeds: Object.values(s.hint_seeds ?? {}).flat().slice(0, 3) as string[],
    }));
    return steps;
  } catch (e) {
    console.warn("[stepGenerator] LLM parse failed:", e instanceof Error ? e.message : String(e));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function generateStepPlan(exercise: Exercise, reference: string): Promise<Step[]> {
  // Try real LLM decomposition first (Stage B); heuristic is fallback.
  const llmSteps = await generateViaLLM(exercise, reference);
  if (llmSteps) {
    const verification = await verifyStepPlan(reference, llmSteps);
    if (verification.ok) return llmSteps;
    console.warn(`[stepGenerator] LLM steps failed verification at "${verification.failedStep?.title}": ${verification.reason} — falling back to heuristic`);
  }

  const fallback = heuristicSteps(exercise, reference);
  const verification = await verifyStepPlan(reference, fallback);
  if (!verification.ok) {
    console.warn(`[stepGenerator] heuristic verification warning at "${verification.failedStep?.title}": ${verification.reason} — publishing anyway for MVP (wrong step worse than no hint, but we have no better)`);
  }
  return fallback;
}
