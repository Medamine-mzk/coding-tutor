import type { Exercise } from "./types";

export function generateHeuristicReference(exercise: Exercise): string | null {
  const stmt = exercise.statement.toLowerCase();
  const examples = exercise.examples;

  // Function signature takes priority over generic I/O sum
  const fnMatch = exercise.statement.match(/def\s+(\w+)\s*\(([^)]*)\)/);
  if (fnMatch && examples.length > 0) {
    const fn = fnMatch[1];
    const ex = examples[0];
    const nums = ex.input.split(/[ \n]+/).filter(Boolean).map(Number);
    const outNum = Number(ex.output);
    const sum = nums.reduce((a, b) => a + b, 0);
    if (!isNaN(outNum) && sum === outNum) {
      return `def ${fn}(a, b):
    return a + b
`;
    }
    return `def ${fn}(*args):
    return ${ex.output}
`;
  }

  // Auth login / password
  if ((stmt.includes("login") || stmt.includes("mot de passe")) && stmt.includes("admin")) {
    return `login = input().strip()
mdp = input().strip()
if login == "admin" and mdp == "admin":
    print("Bienvenue")
else:
    print("incorrecte")
`;
  }

  // Vitesse = distance / temps with unit conversion (km->m, min->s)
  if (stmt.includes("vitesse") && (stmt.includes("distance") || stmt.includes("kilom")) && (stmt.includes("temps") || stmt.includes("minute"))) {
    return `distance_km = float(input().strip() or 0)
temps_min = float(input().strip() or 0)
if temps_min == 0:
    print(0)
else:
    distance_m = distance_km * 1000
    temps_s = temps_min * 60
    vitesse = distance_m / temps_s
    if vitesse.is_integer():
        print(int(vitesse))
    else:
        print(f"{vitesse:.2f}")
`;
  }

  // Sum of two numbers is the most common starter
  if (stmt.includes("somme") || stmt.includes("sum") || (stmt.includes("deux") && stmt.includes("entier")) || stmt.includes("addition")) {
    return `import sys
def solve():
    data = sys.stdin.read().strip().split()
    if not data:
        return
    nums = list(map(int, data))
    print(sum(nums))

if __name__ == "__main__":
    solve()
`;
  }

  return null;
}

async function callGeminiForReference(system: string, user: string): Promise<string> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error("No Gemini key");
  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const headers: Record<string, string> = { "content-type": "application/json" };
  let fullUrl = url;
  if (geminiKey.startsWith("AQ.")) headers["Authorization"] = `Bearer ${geminiKey}`;
  else {
    headers["x-goog-api-key"] = geminiKey;
    fullUrl = `${url}?key=${encodeURIComponent(geminiKey)}`;
  }
  const body = {
    contents: [{ role: "user", parts: [{ text: `${system}\n\n${user}` }] }],
    systemInstruction: { parts: [{ text: system }] },
    generationConfig: { temperature: 0.2, maxOutputTokens: 1500 },
  };
  const res = await fetch(fullUrl, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${txt.slice(0, 500)}`);
  }
  const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

export async function generateReferenceSolutionLLM(exercise: Exercise): Promise<string | null> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const hasGemini = !!geminiKey;
  const hasGroq = !!groqKey;
  const hasAnthropic = !!anthropicKey;
  if (!hasGemini && !hasGroq && !hasAnthropic) return generateHeuristicReference(exercise);

  const examplesStr = exercise.examples.map((e) => `Input: ${e.input} -> Output: ${e.output}`).join("\n");
  const system =
    "You are a reference solution generator for a Python coding tutor. Given an exercise title, statement, and examples, return ONLY a correct Python solution that reads from stdin and prints to stdout (or defines the required function). Keep it short and correct. Never include explanation, only code in a ```python block.";
  const userContent = `Title: ${exercise.title}\nStatement: ${exercise.statement}\nIO: ${exercise.ioSpec}\nConstraints: ${exercise.constraints.join("; ")}\nExamples:\n${examplesStr}\nConcepts: ${exercise.concepts.join(", ")}\n\nReturn only the Python code.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    let textPart = "";
    if (hasGemini) {
      try {
        textPart = await callGeminiForReference(system, userContent);
      } catch (e) {
        console.warn("[reference] Gemini failed, falling back:", e instanceof Error ? e.message : String(e));
        if (hasGroq) {
          // fall through to Groq
        } else if (hasAnthropic) {
          // fall through to Anthropic
        } else throw e;
      }
    }
    if (!textPart && hasGroq) {
      const groqModel = process.env.GROQ_MODEL ?? process.env.TUTOR_MODEL ?? "llama-3.1-8b-instant";
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: groqModel,
          temperature: 0.2,
          max_tokens: 1500,
          messages: [
            { role: "system", content: system },
            { role: "user", content: userContent },
          ],
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Groq ${res.status}`);
      const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
      textPart = data.choices?.[0]?.message?.content ?? "";
    }
    if (!textPart && hasAnthropic) {
      const model = process.env.TUTOR_MODEL ?? process.env.PARSE_MODEL ?? "claude-sonnet-4-20250514";
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey!,
          "content-type": "application/json",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1500,
          system,
          messages: [{ role: "user", content: userContent }],
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Anthropic ${res.status}`);
      const data = (await res.json()) as { content: Array<{ type: string; text: string }> };
      textPart = data.content?.find((c) => c.type === "text")?.text ?? "";
    }
    const block = textPart.match(/```python([\s\S]*?)```/);
    if (block) return block[1].trim();
    const fallback = textPart.match(/```([\s\S]*?)```/);
    if (fallback) return fallback[1].trim();
    if (textPart.includes("def ") || textPart.includes("print") || textPart.includes("input")) return textPart.trim();
    return generateHeuristicReference(exercise);
  } catch {
    return generateHeuristicReference(exercise);
  } finally {
    clearTimeout(timer);
  }
}
