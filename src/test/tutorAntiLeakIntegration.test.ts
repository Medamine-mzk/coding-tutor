import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "@/app/api/tutor/chat/route";
import { NextRequest } from "next/server";
import { clearBlockedLog, getBlockedLog } from "@/lib/tutor/antiLeak";

function makeReq(body: unknown, ip = "10.0.0.1") {
  return new NextRequest("http://localhost/api/tutor/chat", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

async function readSSE(res: Response): Promise<string> {
  const text = await res.text();
  const deltas: string[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const jsonStr = trimmed.slice(5).trim();
    if (!jsonStr) continue;
    try {
      const evt = JSON.parse(jsonStr) as { delta?: string };
      if (evt.delta) deltas.push(evt.delta);
    } catch {}
  }
  return deltas.join("");
}

describe("tutor anti-leak integration — regeneration", () => {
  const origAnthropic = process.env.ANTHROPIC_API_KEY;
  const origGroq = process.env.GROQ_API_KEY;
  beforeEach(() => {
    clearBlockedLog();
    vi.restoreAllMocks();
    // Ensure Groq does not interfere — these tests specifically mock Anthropic
    delete process.env.GROQ_API_KEY;
  });
  afterEach(() => {
    if (origAnthropic) process.env.ANTHROPIC_API_KEY = origAnthropic;
    else delete process.env.ANTHROPIC_API_KEY;
    if (origGroq) process.env.GROQ_API_KEY = origGroq;
    else delete process.env.GROQ_API_KEY;
    vi.restoreAllMocks();
    clearBlockedLog();
  });

  it("filters overlong code block at level <5 and regenerates to safe fallback", async () => {
    process.env.ANTHROPIC_API_KEY = "sk_test_dummy";
    const leakCode = "```python\n" + Array(7).fill("print(1)").join("\n") + "\n```";
    const mockFetch = vi.fn(async () =>
      new Response(JSON.stringify({ content: [{ type: "text", text: leakCode }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", mockFetch);

    const res = await POST(
      makeReq({
        locale: "fr",
        code: 'print("hi")',
        exercise: { id: "ex_1", title: "Somme", statement: "somme", ioSpec: "io", constraints: [], examples: [{ input: "2 3", output: "5" }], concepts: ["loops"], milestones: [] },
        tests: [{ id: "t1", input: "2 3", stdin: ["2", "3"], expected: "5", kind: "stdout", hidden: false }],
        hintHistory: [],
        codeChangedSinceLastHint: true,
        hasRunSinceLastHint: true,
      })
    );

    const text = await readSSE(res);
    // Should be filtered to safe fallback (question or TODO), not the overlong leak
    expect(text).not.toContain("print(1)\nprint(1)\nprint(1)\nprint(1)\nprint(1)\nprint(1)\nprint(1)");
    expect(getBlockedLog().length).toBeGreaterThan(0);
    expect(getBlockedLog()[0].reason).toMatch(/overlong/i);
  });

  it("filters would-pass full solution even at level 5 and falls back to skeleton", async () => {
    process.env.ANTHROPIC_API_KEY = "sk_test_dummy";
    const leakSolution = "```python\nimport sys\nprint(sum(map(int, sys.stdin.read().split())))\n```";
    const mockFetch = vi.fn(async () =>
      new Response(JSON.stringify({ content: [{ type: "text", text: leakSolution }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", mockFetch);

    const res = await POST(
      makeReq({
        locale: "fr",
        code: "",
        exercise: { id: "ex_1", title: "Somme", statement: "somme de deux nombres", ioSpec: "io", constraints: [], examples: [{ input: "2 3", output: "5" }], concepts: ["loops"], milestones: [] },
        tests: [
          { id: "t1", input: "2 3", stdin: ["2", "3"], expected: "5", kind: "stdout", hidden: false },
          { id: "t2", input: "0 0", stdin: ["0", "0"], expected: "0", kind: "stdout", hidden: true, category: "zero" },
        ],
        hintHistory: [{ level: 5, at: new Date().toISOString() }],
        codeChangedSinceLastHint: true,
        hasRunSinceLastHint: true,
        requestedHintLevel: 5,
      })
    );

    const text = await readSSE(res);
    expect(text).not.toContain("print(sum(map(int");
    // Fallback at level 5 is skeleton with TODO
    expect(text).toMatch(/TODO|à compléter|Skeleton/i);
    expect(getBlockedLog().length).toBeGreaterThan(0);
  });

  it("allows skeleton at level 5 (not blocked)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk_test_dummy";
    const skeleton = "```python\ndef solve():\n    # TODO: lire l'entrée\n    # TODO: traiter\n    # TODO: afficher\n```";
    const mockFetch = vi.fn(async () =>
      new Response(JSON.stringify({ content: [{ type: "text", text: skeleton }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", mockFetch);

    const res = await POST(
      makeReq({
        locale: "fr",
        code: "x=1",
        exercise: { id: "ex_1", title: "Somme", statement: "somme", ioSpec: "io", constraints: [], examples: [], concepts: ["loops"], milestones: [] },
        tests: [{ id: "t1", input: "2 3", stdin: ["2", "3"], expected: "5", kind: "stdout", hidden: false }],
        hintHistory: [{ level: 5, at: new Date().toISOString() }],
        codeChangedSinceLastHint: true,
        hasRunSinceLastHint: true,
        requestedHintLevel: 5,
      })
    );

    const text = await readSSE(res);
    expect(text).toContain("TODO");
    // Should not be blocked (no log or not overlong)
    // Skeleton passes filter, so not necessarily logged as blocked
    // But ensure it was not replaced with fallback that is different skeleton? It is skeleton itself
    expect(text).toMatch(/TODO/);
  });

  it("blocks high similarity to reference", async () => {
    process.env.ANTHROPIC_API_KEY = "sk_test_dummy";
    // Reference for sum is `import sys ... print(sum(...))`; tutor returning same is high similarity
    const leak = "```python\nimport sys\ndata = sys.stdin.read().strip().split()\nprint(sum(map(int, data)))\n```";
    const mockFetch = vi.fn(async () =>
      new Response(JSON.stringify({ content: [{ type: "text", text: leak }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", mockFetch);

    const res = await POST(
      makeReq({
        locale: "fr",
        code: "",
        exercise: { id: "ex_1", title: "Somme", statement: "somme de deux nombres", ioSpec: "io", constraints: [], examples: [{ input: "2 3", output: "5" }], concepts: ["loops"], milestones: [] },
        tests: [{ id: "t1", input: "2 3", stdin: ["2", "3"], expected: "5", kind: "stdout", hidden: false }],
        hintHistory: [],
        codeChangedSinceLastHint: true,
        hasRunSinceLastHint: true,
      })
    );

    const text = await readSSE(res);
    // Should be filtered away from exact reference
    expect(text).not.toContain("data = sys.stdin.read().strip().split()");
  });

  it("logs blocked leaks for later prompt improvement", async () => {
    process.env.ANTHROPIC_API_KEY = "sk_test_dummy";
    const leak = "```python\n" + Array(7).fill("a=1").join("\n") + "\n```";
    const mockFetch = vi.fn(async () =>
      new Response(JSON.stringify({ content: [{ type: "text", text: leak }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", mockFetch);
    clearBlockedLog();
    const res = await POST(makeReq({ locale: "fr", code: "", exercise: { id: "ex_1", title: "T", statement: "s", ioSpec: "io", constraints: [], examples: [], concepts: [], milestones: [] }, tests: [], hintHistory: [], codeChangedSinceLastHint: true, hasRunSinceLastHint: true }));
    await readSSE(res);
    expect(getBlockedLog().length).toBeGreaterThan(0);
    expect(getBlockedLog()[0].hintLevel).toBeDefined();
  });
});
