import type { TestCase } from "./types";
import { runPythonWithStdin } from "./runPython";

export type ValidateResult = {
  kept: TestCase[];
  discarded: Array<{ test: TestCase; reason: string }>;
};

function isPythonAvailable(): boolean {
  return true;
}

export async function validateTestsWithReference(
  tests: TestCase[],
  referenceCode: string,
  opts: { timeoutMs?: number } = {}
): Promise<ValidateResult> {
  const timeoutMs = opts.timeoutMs ?? 2000;
  const kept: TestCase[] = [];
  const discarded: Array<{ test: TestCase; reason: string }> = [];

  if (!referenceCode || !isPythonAvailable()) {
    // No reference or python not available — keep all (degrade gracefully)
    return { kept: tests, discarded: [] };
  }

  for (const tc of tests) {
    // Only validate stdout tests via stdin; call tests need separate harness
    if (tc.kind === "call" && tc.fnCall) {
      const harness = `${referenceCode}\n\n__result = ${tc.fnCall}\nprint(__result)\n`;
      const res = await runPythonWithStdin(harness, tc.stdin ?? [], timeoutMs);
      if (res.timedOut) {
        discarded.push({ test: tc, reason: "reference timed out" });
        continue;
      }
      if (res.exitCode !== 0) {
        discarded.push({ test: tc, reason: `reference failed: ${res.stderr.slice(0, 200)}` });
        continue;
      }
      const actual = res.stdout.trim();
      const expected = tc.expected.trim();
      if (actual !== expected) {
        discarded.push({ test: tc, reason: `reference mismatch: expected "${expected}" got "${actual}"` });
        continue;
      }
      kept.push(tc);
    } else {
      const stdin = tc.stdin ?? (tc.input ? tc.input.split(/[ \n]+/).filter(Boolean) : []);
      const res = await runPythonWithStdin(referenceCode, stdin, timeoutMs);
      if (res.timedOut) {
        discarded.push({ test: tc, reason: "reference timed out" });
        continue;
      }
      if (res.exitCode !== 0) {
        discarded.push({ test: tc, reason: `reference failed: ${res.stderr.slice(0, 200)}` });
        continue;
      }
      const actual = res.stdout.trimEnd();
      const expected = tc.expected.trimEnd();
      if (actual !== expected) {
        // Check trimmed equality first, then exact
        if (actual.trim() !== expected.trim()) {
          discarded.push({ test: tc, reason: `reference mismatch: expected "${expected}" got "${actual}"` });
          continue;
        }
      }
      kept.push(tc);
    }
  }

  return { kept, discarded };
}
