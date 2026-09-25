import type { CanonicalExercise, LocalizedCopy, Step } from "./stepPlan";

async function translateViaLLM(texts: string[], targetLocale: string): Promise<string[] | null> {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return null;
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasGroq = !!process.env.GROQ_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  if (!hasGemini && !hasGroq && !hasAnthropic) return null;
  const langName = targetLocale === "ar" ? "Arabic" : targetLocale === "en" ? "English" : "French";
  const system = `You are a translator for a coding tutor. Translate the following JSON array of display strings to ${langName}. Keep code identifiers, variable names, and error names in English. Return JSON only: {"translations": ["..."]}.`;
  const user = JSON.stringify({ texts, targetLocale });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    let jsonStr = "";
    if (hasGemini) {
      try {
        const key = process.env.GEMINI_API_KEY!;
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
          generationConfig: { temperature: 0.2, maxOutputTokens: 1000, responseMimeType: "application/json" },
        };
        const res = await fetch(fullUrl, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal });
        if (res.ok) {
          const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
          jsonStr = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        }
      } catch {}
    }
    if (!jsonStr && hasGroq) {
      try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "content-type": "application/json" },
          body: JSON.stringify({
            model: process.env.GROQ_MODEL ?? "llama-3.1-8b-instant",
            temperature: 0.2,
            max_tokens: 1000,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
          }),
          signal: controller.signal,
        });
        if (res.ok) {
          const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
          jsonStr = data.choices?.[0]?.message?.content ?? "";
        }
      } catch {}
    }
    if (!jsonStr && hasAnthropic) {
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": process.env.ANTHROPIC_API_KEY!, "content-type": "application/json", "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: process.env.TUTOR_MODEL ?? "claude-sonnet-4-20250514", max_tokens: 1000, system, messages: [{ role: "user", content: user }] }),
          signal: controller.signal,
        });
        if (res.ok) {
          const data = (await res.json()) as { content: Array<{ type: string; text: string }> };
          jsonStr = data.content?.find((c) => c.type === "text")?.text ?? "";
        }
      } catch {}
    }
    if (!jsonStr) return null;
    const match = jsonStr.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as { translations?: string[] };
    if (!parsed.translations || parsed.translations.length !== texts.length) return null;
    return parsed.translations;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function ensureLocalizedCopy(
  canonical: CanonicalExercise,
  targetLocale: string
): Promise<LocalizedCopy> {
  if (canonical.languages[targetLocale]) return canonical.languages[targetLocale];

  const sourceLocale = Object.keys(canonical.languages)[0];
  const source = canonical.languages[sourceLocale];
  if (!source) throw new Error("no source language");

  // Try real LLM translation for display strings only (cheap, no re-solve). Falls back to copy.
  const toTranslate = [source.title, source.statement_display, ...source.step_titles, ...source.step_goals];
  const translatedTexts = await translateViaLLM(toTranslate, targetLocale);
  let translated: LocalizedCopy;
  if (translatedTexts) {
    const nTitles = source.step_titles.length;
    const nGoals = source.step_goals.length;
    translated = {
      title: translatedTexts[0] ?? source.title,
      statement_display: translatedTexts[1] ?? source.statement_display,
      step_titles: translatedTexts.slice(2, 2 + nTitles),
      step_goals: translatedTexts.slice(2 + nTitles, 2 + nTitles + nGoals),
    };
  } else {
    // Fallback: copy without translation — still caches, so we never re-run Stage A/B for a language variant (addendum 2.4)
    translated = {
      title: source.title,
      statement_display: source.statement_display,
      step_titles: [...source.step_titles],
      step_goals: [...source.step_goals],
    };
  }
  canonical.languages[targetLocale] = translated;
  return translated;
}

export function applyLocalizedCopyToSteps(steps: Step[], copy: LocalizedCopy): Step[] {
  return steps.map((s, i) => ({
    ...s,
    title: copy.step_titles[i] ?? s.title,
    goal: copy.step_goals[i] ?? s.goal,
  }));
}
