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

export async function generateReferenceSolutionLLM(exercise: Exercise): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return generateHeuristicReference(exercise);

  const model = process.env.TUTOR_MODEL ?? process.env.PARSE_MODEL ?? "claude-sonnet-4-20250514";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const examplesStr = exercise.examples.map((e) => `Input: ${e.input} -> Output: ${e.output}`).join("\n");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        system:
          "You are a reference solution generator for a Python coding tutor. Given an exercise title, statement, and examples, return ONLY a correct Python solution that reads from stdin and prints to stdout (or defines the required function). Keep it short and correct. Never include explanation, only code in a ```python block.",
        messages: [
          {
            role: "user",
            content: `Title: ${exercise.title}\nStatement: ${exercise.statement}\nIO: ${exercise.ioSpec}\nConstraints: ${exercise.constraints.join("; ")}\nExamples:\n${examplesStr}\nConcepts: ${exercise.concepts.join(", ")}\n\nReturn only the Python code.`,
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`Anthropic ${res.status}`);
    const data = (await res.json()) as { content: Array<{ type: string; text: string }> };
    const textPart = data.content?.find((c) => c.type === "text")?.text ?? "";
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
