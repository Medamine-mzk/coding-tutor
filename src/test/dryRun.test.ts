import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { dryRunVerify, DryRunUnavailable, needsThirdPartyModules } from "@/lib/exercise/dryRun";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

beforeEach(() => {
  process.env.GROQ_API_KEY = "gsk_test";
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GROQ_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
});

function mockGroq(content: string, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, status, json: async () => ({ choices: [{ message: { content } }] }) }) as Response)
  );
}

describe("needsThirdPartyModules", () => {
  it("detects numpy/pandas imports, ignores stdlib", () => {
    expect(needsThirdPartyModules("from numpy import array\nprint(1)")).toBe(true);
    expect(needsThirdPartyModules("import pandas as pd")).toBe(true);
    expect(needsThirdPartyModules("from math import sqrt\nprint(sqrt(4))")).toBe(false);
    expect(needsThirdPartyModules("n = int(input())\nprint(n)")).toBe(false);
  });
});

describe("dryRunVerify", () => {
  it("returns ok when predicted outputs match (we compare, not the LLM)", async () => {
    mockGroq('{"outputs": ["5", "0"]}');
    const res = await dryRunVerify("a=int(input())\nprint(a)", [
      { input: "5", output: "5" },
      { input: "0", output: "0" },
    ]);
    expect(res.ok).toBe(true);
    expect(res.provider).toBe("groq");
    expect(res.perExample).toHaveLength(2);
  });

  it("returns ok:false with per-example detail on mismatch", async () => {
    mockGroq('{"outputs": ["6"]}');
    const res = await dryRunVerify("print(int(input()) + 1)", [{ input: "5", output: "5" }]);
    expect(res.ok).toBe(false);
    expect(res.perExample[0]).toMatchObject({ expected: "5", predicted: "6", match: false });
  });

  it("throws DryRunUnavailable without any key", async () => {
    delete process.env.GROQ_API_KEY;
    await expect(dryRunVerify("print(1)", [{ input: "", output: "1" }])).rejects.toBeInstanceOf(DryRunUnavailable);
  });

  it("throws DryRunUnavailable on unparseable LLM output", async () => {
    mockGroq("Sure, the output is 5!");
    await expect(dryRunVerify("print(1)", [{ input: "", output: "1" }])).rejects.toBeInstanceOf(DryRunUnavailable);
  });

  it("falls back to Gemini when Groq fails", async () => {
    const spy = vi.fn(async (url: string) => {
      if (url === GROQ_URL) return { ok: false, status: 429, text: async () => "rate limited" } as Response;
      return {
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: '{"outputs": ["7"]}' }] } }] }),
      } as Response;
    });
    vi.stubGlobal("fetch", spy);
    process.env.GEMINI_API_KEY = "AIza_test";
    const res = await dryRunVerify("print(int(input()) * 2)", [{ input: "3", output: "6" }]);
    expect(res.ok).toBe(false); // predicted 7 !== 6
    expect(res.provider).toBe("gemini");
    expect(res.perExample[0].predicted).toBe("7");
  });
});
