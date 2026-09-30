import { describe, it, expect, vi } from "vitest";
import { validateTestsWithReference } from "@/lib/exercise/validate";
import type { TestCase } from "@/lib/exercise/types";

// Simulate a host without Python (e.g. serverless): every spawn fails with ENOENT.
vi.mock("@/lib/exercise/runPython", () => ({
  runPythonWithStdin: vi.fn(async () => ({
    stdout: "",
    stderr: "spawn python ENOENT",
    exitCode: 1,
    timedOut: false,
    sandboxUnavailable: true,
  })),
}));

describe("validateTestsWithReference — sandbox absent (serverless)", () => {
  it("keeps all tests and flags sandboxUnavailable instead of discarding everything", async () => {
    const tests: TestCase[] = [
      { id: "t1", input: "2 3", stdin: ["2", "3"], expected: "5", kind: "stdout", hidden: false },
      { id: "t2", input: "0 0", stdin: ["0", "0"], expected: "0", kind: "stdout", hidden: true, category: "zero" },
    ];
    const result = await validateTestsWithReference(tests, "n = int(input())\nprint(n)", { timeoutMs: 1000 });
    expect(result.sandboxUnavailable).toBe(true);
    expect(result.kept.length).toBe(2);
    expect(result.discarded.length).toBe(0);
  });

  it("keeps call-kind tests too when sandbox is absent", async () => {
    const tests: TestCase[] = [
      { id: "c1", expected: "5", kind: "call", fnCall: "add(2, 3)", hidden: false },
    ];
    const result = await validateTestsWithReference(tests, "def add(a, b):\n    return a + b", { timeoutMs: 1000 });
    expect(result.sandboxUnavailable).toBe(true);
    expect(result.kept.length).toBe(1);
  });
});
