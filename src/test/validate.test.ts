import { describe, it, expect } from "vitest";
import { validateTestsWithReference } from "@/lib/exercise/validate";
import type { TestCase } from "@/lib/exercise/types";

const sumReference = `
import sys
def solve():
    data = sys.stdin.read().strip().split()
    if not data:
        return
    nums = list(map(int, data))
    print(sum(nums))
if __name__ == "__main__":
    solve()
`;

describe("validateTestsWithReference — server-side sandbox", () => {
  it("keeps valid tests that match reference", async () => {
    const tests: TestCase[] = [
      { id: "t1", input: "2 3", stdin: ["2", "3"], expected: "5", kind: "stdout", hidden: false },
      { id: "t2", input: "0 0", stdin: ["0", "0"], expected: "0", kind: "stdout", hidden: true, category: "zero" },
    ];
    const { kept, discarded } = await validateTestsWithReference(tests, sumReference, { timeoutMs: 3000 });
    expect(kept.length).toBe(2);
    expect(discarded.length).toBe(0);
  });

  it("discards tests that reference fails or mismatches", async () => {
    const tests: TestCase[] = [
      { id: "t1", input: "2 3", stdin: ["2", "3"], expected: "999", kind: "stdout", hidden: false }, // wrong expected
      { id: "t2", input: "2 3", stdin: ["2", "3"], expected: "5", kind: "stdout", hidden: true, category: "hidden" },
    ];
    const { kept, discarded } = await validateTestsWithReference(tests, sumReference, { timeoutMs: 3000 });
    expect(kept.length).toBe(1);
    expect(kept[0].id).toBe("t2");
    expect(discarded.length).toBe(1);
    expect(discarded[0].reason).toMatch(/mismatch/i);
  });

  it("validates function-call tests", async () => {
    const ref = `def add(a, b):
    return a + b
`;
    const tests: TestCase[] = [
      { id: "c1", expected: "5", kind: "call", fnCall: "add(2, 3)", hidden: false },
      { id: "c2", expected: "999", kind: "call", fnCall: "add(2, 3)", hidden: false },
    ];
    const { kept, discarded } = await validateTestsWithReference(tests, ref, { timeoutMs: 3000 });
    expect(kept.length).toBe(1);
    expect(kept[0].id).toBe("c1");
    expect(discarded.length).toBe(1);
  });

  it("handles reference timeout gracefully", async () => {
    const infiniteRef = `while True:
    pass
`;
    const tests: TestCase[] = [
      { id: "t1", input: "2 3", stdin: ["2", "3"], expected: "5", kind: "stdout", hidden: false },
    ];
    const { kept, discarded } = await validateTestsWithReference(tests, infiniteRef, { timeoutMs: 500 });
    expect(kept.length).toBe(0);
    expect(discarded[0].reason).toMatch(/timed out/i);
  });

  it("does not expose reference solution in returned data — only kept/discarded", async () => {
    const tests: TestCase[] = [{ id: "t1", input: "2 3", stdin: ["2", "3"], expected: "5", kind: "stdout", hidden: false }];
    const result = await validateTestsWithReference(tests, sumReference);
    expect(result).not.toHaveProperty("code");
    expect(result).not.toHaveProperty("reference");
  });
});
