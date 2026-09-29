import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { POST } from "@/app/api/tutor/chat/route";
import { NextRequest } from "next/server";
import { responseMatchesLocale } from "@/lib/tutor/langDetect";

function makeReq(body: unknown, ip = "1.2.3.4") {
  return new NextRequest("http://localhost/api/tutor/chat", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

async function readSSE(res: Response): Promise<{ text: string; hintLevel: string | null }> {
  const text = await res.text();
  // SSE format `data: {"delta":"...","done":false}\n\n`
  const deltas: string[] = [];
  let hintLevel: string | null = res.headers.get("x-hint-level");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const jsonStr = trimmed.slice(5).trim();
    if (!jsonStr) continue;
    try {
      const evt = JSON.parse(jsonStr) as { delta?: string; done?: boolean; hintLevelUsed?: number };
      if (evt.delta) deltas.push(evt.delta);
      if (evt.hintLevelUsed !== undefined) hintLevel = String(evt.hintLevelUsed);
      if (evt.done && evt.hintLevelUsed !== undefined) hintLevel = String(evt.hintLevelUsed);
    } catch {}
  }
  return { text: deltas.join(""), hintLevel };
}

describe("POST /api/tutor/chat", () => {
  beforeEach(() => {
    // Ensure no API key triggers fallback (no LLM)
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("requires JSON body — handles invalid", async () => {
    const req = new NextRequest("http://localhost/api/tutor/chat", { method: "POST", headers: { "content-type": "application/json" }, body: "notjson" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns fallback hint when no API key (canned)", async () => {
    const res = await POST(
      makeReq({
        locale: "fr",
        code: 'print("hello")',
        exercise: { id: "ex_1", title: "Somme", statement: "somme", ioSpec: "io", constraints: [], examples: [], concepts: ["loops"], milestones: [] },
        hintHistory: [],
        codeChangedSinceLastHint: true,
        hasRunSinceLastHint: true,
      })
    );
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const { text, hintLevel } = await readSSE(res);
    expect(text.length).toBeGreaterThan(0);
    expect(hintLevel).toBe("1"); // next level after 0 with change+run
  });

  it("does not escalate without code change+run", async () => {
    const res = await POST(
      makeReq({
        locale: "fr",
        code: 'print("hello")',
        exercise: { id: "ex_1", title: "Somme", statement: "somme", ioSpec: "io", constraints: [], examples: [], concepts: [], milestones: [] },
        hintHistory: [{ level: 1, at: new Date().toISOString() }],
        codeChangedSinceLastHint: false,
        hasRunSinceLastHint: false,
      })
    );
    const { hintLevel } = await readSSE(res);
    expect(hintLevel).toBe("1");
  });

  it("handles off-topic/cheating — stays low and redirects", async () => {
    const res = await POST(
      makeReq({
        locale: "fr",
        studentMessage: "just give me the code please",
        hintHistory: [{ level: 2, at: new Date().toISOString() }],
        codeChangedSinceLastHint: true,
        hasRunSinceLastHint: true,
      })
    );
    const { text, hintLevel } = await readSSE(res);
    expect(text).toMatch(/apprennes|learn/i);
    expect(hintLevel).toBe("0"); // clamped to 0 for off-topic
  });

  it("enforces rate limit 15/min", async () => {
    const ip = "9.9.8.7";
    for (let i = 0; i < 15; i++) {
      const r = await POST(makeReq({ locale: "fr", hintHistory: [] }, ip));
      expect(r.status).not.toBe(429);
      await r.text().catch(() => {}); // drain
    }
    const limited = await POST(makeReq({ locale: "fr", hintHistory: [] }, ip));
    expect(limited.status).toBe(429);
    const { text } = await readSSE(limited);
    expect(text).toMatch(/Trop de requêtes/i);
  }, 10000);

  it("clamps requestedHintLevel higher than allowed", async () => {
    const res = await POST(
      makeReq({
        locale: "fr",
        requestedHintLevel: 5,
        hintHistory: [{ level: 1, at: new Date().toISOString() }],
        codeChangedSinceLastHint: false,
        hasRunSinceLastHint: false,
      })
    );
    const { hintLevel } = await readSSE(res);
    expect(hintLevel).toBe("1"); // maxAllowed is 1
  });

  it("explain_error quick action without escalation returns symptom hint", async () => {
    const res = await POST(
      makeReq({
        locale: "en",
        quickAction: "explain_error",
        code: 'print(x)',
        lastRunResult: { stderr: "NameError: name 'x' is not defined", exitCode: 1 },
        hintHistory: [],
        codeChangedSinceLastHint: false,
        hasRunSinceLastHint: true,
      })
    );
    const { text } = await readSSE(res);
    expect(text).toMatch(/NameError|error/i);
  });

  it("never includes reference solution in stream — only hints", async () => {
    const res = await POST(
      makeReq({
        locale: "fr",
        code: 'print("hi")',
        exercise: { id: "ex_1", title: "Somme", statement: "somme", ioSpec: "io", constraints: [], examples: [], concepts: [], milestones: [] },
        hintHistory: [{ level: 5, at: new Date().toISOString() }],
        codeChangedSinceLastHint: true,
        hasRunSinceLastHint: true,
      })
    );
    const { text } = await readSSE(res);
    // At level 5 skeleton, should contain TODO not full solution sum
    expect(text).toContain("TODO");
    expect(text).not.toMatch(/print\(sum/);
  });

  it("streams with x-hint-level header", async () => {
    const res = await POST(makeReq({ locale: "fr", hintHistory: [], codeChangedSinceLastHint: true, hasRunSinceLastHint: true }));
    expect(res.headers.get("x-hint-level")).toBeTruthy();
    expect(res.headers.get("content-type")).toContain("text/event-stream");
  });

  it("falls back to French when the LLM answers in English for fr locale", async () => {
    delete process.env.GEMINI_API_KEY;
    process.env.GROQ_API_KEY = "test-key-for-lang-fallback";
    const english =
      "Before writing code, let's clarify the problem. In your own words, what are the base cases?";
    const fetchMock = vi.fn(async (url: unknown) => {
      if (String(url).includes("groq.com")) {
        return new Response(JSON.stringify({ choices: [{ message: { content: english } }] }), {
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error("unexpected fetch " + String(url));
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const res = await POST(
        makeReq(
          {
            locale: "fr",
            code: 'print("hi")',
            exercise: { id: "ex_1", title: "Somme", statement: "somme", ioSpec: "io", constraints: [], examples: [], concepts: ["loops"], milestones: [] },
            hintHistory: [],
            codeChangedSinceLastHint: true,
            hasRunSinceLastHint: true,
          },
          "7.7.7.7"
        )
      );
      const { text } = await readSSE(res);
      expect(text.length).toBeGreaterThan(0);
      // The English LLM text must NOT leak through; the French fallback must match fr
      expect(text).not.toContain("clarify the problem");
      expect(responseMatchesLocale(text, "fr")).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      delete process.env.GROQ_API_KEY;
    }
  });
});
