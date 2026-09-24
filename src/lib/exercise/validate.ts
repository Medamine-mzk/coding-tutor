import type { TestCase } from "./types";
import { spawn } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type ValidateResult = {
  kept: TestCase[];
  discarded: Array<{ test: TestCase; reason: string }>;
};

function isPythonAvailable(): boolean {
  // Assume python is available as `python` per earlier check
  return true;
}

async function runPythonWithStdin(code: string, stdin: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
  const tmpFile = join(tmpdir(), `ref_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.py`);
  try {
    await writeFile(tmpFile, code, "utf-8");

    return await new Promise((resolve) => {
      const inputStr = stdin.join("\n");
      const child = spawn("python", [tmpFile], { stdio: ["pipe", "pipe", "pipe"] });

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        try { child.kill("SIGKILL"); } catch {}
        resolve({ stdout, stderr: stderr + "\nTimed out", exitCode: 124, timedOut: true });
      }, timeoutMs);

      child.stdout.on("data", (d) => { stdout += d.toString(); });
      child.stderr.on("data", (d) => { stderr += d.toString(); });
      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({ stdout, stderr: err.message, exitCode: 1, timedOut: false });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (timedOut) return;
        resolve({ stdout, stderr, exitCode: code ?? 0, timedOut: false });
      });

      if (inputStr) {
        child.stdin.write(inputStr);
      }
      child.stdin.end();
    });
  } finally {
    try { await unlink(tmpFile); } catch {}
  }
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
