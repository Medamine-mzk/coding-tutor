import { spawn } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type RunPythonResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
};

/**
 * Run Python code with given stdin lines via a temp file and `python` spawn.
 * Used server-side for test validation and anti-leak would-pass checks.
 * Timeout kills the process with SIGKILL.
 */
export async function runPythonWithStdin(code: string, stdin: string[], timeoutMs: number): Promise<RunPythonResult> {
  const tmpFile = join(tmpdir(), `py_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.py`);
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
        try {
          child.kill("SIGKILL");
        } catch {}
        resolve({ stdout, stderr: stderr + "\nTimed out", exitCode: 124, timedOut: true });
      }, timeoutMs);

      child.stdout.on("data", (d) => {
        stdout += d.toString();
      });
      child.stderr.on("data", (d) => {
        stderr += d.toString();
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({ stdout, stderr: err.message, exitCode: 1, timedOut: false });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (timedOut) return;
        resolve({ stdout, stderr, exitCode: code ?? 0, timedOut: false });
      });

      if (inputStr) child.stdin.write(inputStr);
      child.stdin.end();
    });
  } finally {
    try {
      await unlink(tmpFile);
    } catch {}
  }
}
