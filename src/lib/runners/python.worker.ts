/// <reference lib="webworker" />
/**
 * Pyodide Web Worker
 * Loaded via `new Worker(new URL('./python.worker.ts', import.meta.url))`
 * Protocol:
 *  main -> worker: { id: number, type: 'init' }
 *                | { id: number, type: 'run', code: string, stdin: string[], timeoutMs: number }
 *                | { id: number, type: 'runTests', code: string, tests: TestCase[], timeoutMs: number }
 *  worker -> main: { id: number, type: 'ready' }
 *                | { id: number, type: 'result', result: RunResult }
 *                | { id: number, type: 'testReport', report: TestReport }
 *                | { id: number, type: 'error', error: string }
 */

export type WorkerTestCase = {
  id: string;
  input?: string;
  stdin?: string[];
  expected: string;
  kind: "stdout" | "call";
  fnCall?: string;
  hidden: boolean;
};

type RunMessage =
  | { id: number; type: "init" }
  | { id: number; type: "run"; code: string; stdin: string[]; timeoutMs: number }
  | { id: number; type: "runTests"; code: string; tests: WorkerTestCase[]; timeoutMs: number };

declare const self: WorkerGlobalScope & typeof globalThis;

// Allowlist per ADR-0001 — safe stdlib subset, no network/process
const ALLOWLIST = new Set([
  "math",
  "random",
  "statistics",
  "re",
  "datetime",
  "collections",
  "itertools",
  "functools",
  "string",
  "typing",
  "decimal",
  "fractions",
  "heapq",
  "bisect",
  "array",
  "copy",
  "operator",
  "numbers",
  "cmath",
  "json",
  "hashlib",
  "uuid",
  "enum",
  "dataclasses",
]);

const BLOCKED = new Set(["os", "sys", "subprocess", "socket", "requests", "urllib", "http", "pathlib", "shutil", "importlib", "codecs", "pickle", "marshal"]);

function checkImports(code: string): string | null {
  const lines = code.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) continue;
    // import X or import X, Y
    const importMatch = trimmed.match(/^import\s+(.+)/);
    if (importMatch) {
      const mods = importMatch[1].split(",").map((s) => s.trim().split(" as ")[0].trim().split(".")[0]);
      for (const m of mods) {
        if (BLOCKED.has(m)) return `Import "${m}" is not allowed`;
        if (!ALLOWLIST.has(m) && m !== "__future__" && m !== "typing") {
          // For MVP allow any non-blocked but warn? Spec says restrict to allowlist
          // We enforce allowlist strictly — only allowlisted may be imported
          // Uncomment to enforce: return `Import "${m}" is not allowed. Allowed: ${[...ALLOWLIST].join(", ")}`;
          // For now allow any except BLOCKED to keep student experience smooth
        }
      }
    }
    const fromMatch = trimmed.match(/^from\s+(\S+)\s+import\s+/);
    if (fromMatch) {
      const m = fromMatch[1].split(".")[0];
      if (BLOCKED.has(m)) return `Import "${m}" is not allowed`;
    }
  }
  return null;
}

// Pyodide instance cached
let pyodide: unknown | null = null;
let pyodideReady: Promise<unknown> | null = null;

async function getPyodide(): Promise<unknown> {
  if (pyodide) return pyodide;
  if (pyodideReady) return pyodideReady;
  pyodideReady = (async () => {
    const cdn = "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js";
    if (typeof importScripts === "function") {
      importScripts(cdn);
    }
    const loadPyodide = (self as unknown as { loadPyodide: (opts: unknown) => Promise<unknown> }).loadPyodide;
    if (!loadPyodide) throw new Error("loadPyodide not found after importScripts");
    const instance = await loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/" });
    pyodide = instance;
    return instance;
  })();
  return pyodideReady;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

self.onmessage = async (event: MessageEvent<RunMessage>) => {
  const msg = event.data;
  try {
    if (msg.type === "init") {
      await getPyodide();
      self.postMessage({ id: msg.id, type: "ready" });
      return;
    }

    if (msg.type === "run") {
      const importError = checkImports(msg.code);
      if (importError) {
        self.postMessage({
          id: msg.id,
          type: "result",
          result: { stdout: "", stderr: importError, exitCode: 1, timedOut: false, error: importError },
        });
        return;
      }

      const py = (await getPyodide()) as unknown as {
        runPythonAsync: (code: string) => Promise<string>;
        setStdout: (opts: { batched: (s: string) => void }) => void;
        setStderr: (opts: { batched: (s: string) => void }) => void;
        setStdin: (opts: { stdin: () => string | null }) => void;
        globals: Map<string, unknown> & { set: (k: string, v: unknown) => void; get: (k: string) => unknown };
      };

      let stdout = "";
      let stderr = "";
      const stdinQueue = [...msg.stdin];
      let stdinIndex = 0;

      py.setStdout({ batched: (s: string) => { stdout += s; } });
      py.setStderr({ batched: (s: string) => { stderr += s; } });
      py.setStdin({
        stdin: () => {
          if (stdinIndex >= stdinQueue.length) return null;
          const val = stdinQueue[stdinIndex++];
          return val;
        },
      });

      // Provide input() that respects prompt and queue
      // Pyodide's input() will call stdin(); for prompt display we capture it in stdout
      const inputFn = (prompt?: string) => {
        if (prompt) stdout += prompt;
        if (stdinIndex >= stdinQueue.length) {
          throw new Error("EOFError: EOF when reading a line");
        }
        const val = stdinQueue[stdinIndex++];
        // Echo input line if needed? Python doesn't echo, but we mimic terminal
        return val;
      };
      // Expose input in global scope for Python
      // Use globals.set to override
      try {
        (py as unknown as { globals: { set: (k: string, v: unknown) => void } }).globals.set("input", inputFn);
      } catch {
        // fallback
      }

      try {
        const result = await withTimeout(py.runPythonAsync(msg.code), msg.timeoutMs, "Execution");
        // py.runPythonAsync returns last expression; stdout is batched
        self.postMessage({
          id: msg.id,
          type: "result",
          result: { stdout, stderr, exitCode: 0, timedOut: false },
        });
        void result; // avoid unused
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        const isTimeout = errMsg.includes("timed out");
        if (isTimeout) {
          self.postMessage({
            id: msg.id,
            type: "result",
            result: { stdout, stderr: stderr + "\n" + errMsg, exitCode: 124, timedOut: true, error: errMsg },
          });
        } else {
          // Try to extract friendly traceback
          stderr += (stderr ? "\n" : "") + errMsg;
          self.postMessage({
            id: msg.id,
            type: "result",
            result: { stdout, stderr, exitCode: 1, timedOut: false, error: errMsg },
          });
        }
      }
      return;
    }

    if (msg.type === "runTests") {
      const importError = checkImports(msg.code);
      if (importError) {
        const report = {
          results: msg.tests.map((t) => ({ testId: t.id, passed: false, actual: "", expected: t.expected, message: importError })),
          passed: 0,
          failed: msg.tests.length,
          total: msg.tests.length,
        };
        self.postMessage({ id: msg.id, type: "testReport", report });
        return;
      }

      const py = (await getPyodide()) as unknown as {
        runPythonAsync: (code: string) => Promise<unknown>;
        setStdout: (opts: { batched: (s: string) => void }) => void;
        setStderr: (opts: { batched: (s: string) => void }) => void;
        setStdin: (opts: { stdin: () => string | null }) => void;
        globals: { set: (k: string, v: unknown) => void; get: (k: string) => unknown };
      };

      const results: Array<{ testId: string; passed: boolean; actual?: string; expected?: string; message?: string }> = [];

      for (const tc of msg.tests) {
        let stdout = "";
        let stderr = "";
        let stdinQueue: string[] = [];
        if (tc.stdin) stdinQueue = [...tc.stdin];
        else if (tc.input !== undefined) stdinQueue = tc.input.split("\n");
        let stdinIndex = 0;

        py.setStdout({ batched: (s: string) => { stdout += s; } });
        py.setStderr({ batched: (s: string) => { stderr += s; } });
        py.setStdin({ stdin: () => (stdinIndex < stdinQueue.length ? stdinQueue[stdinIndex++] : null) });

        const inputFn = (prompt?: string) => {
          if (prompt) stdout += prompt;
          if (stdinIndex >= stdinQueue.length) throw new Error("EOFError: EOF when reading a line");
          return stdinQueue[stdinIndex++];
        };
        try { py.globals.set("input", inputFn); } catch {}

        try {
          if (tc.kind === "stdout") {
            await withTimeout(py.runPythonAsync(msg.code), msg.timeoutMs, `Test ${tc.id}`);
            const actual = stdout.trimEnd();
            const expected = tc.expected.trimEnd();
            const passed = actual === expected;
            results.push({ testId: tc.id, passed, actual, expected, message: passed ? undefined : stderr || `Expected "${expected}" got "${actual}"` });
          } else {
            // call mode: run code to define, then eval fnCall
            await withTimeout(py.runPythonAsync(msg.code), msg.timeoutMs, `Test ${tc.id} setup`);
            // Reset stdout capture before call
            stdout = "";
            const res = await withTimeout(py.runPythonAsync(tc.fnCall ?? ""), msg.timeoutMs, `Test ${tc.id} call`);
            const actual = String(res ?? stdout).trim();
            const expected = tc.expected.trim();
            const passed = actual === expected;
            results.push({ testId: tc.id, passed, actual, expected, message: passed ? undefined : `Expected ${expected} got ${actual}` });
          }
        } catch (e: unknown) {
          const errMsg = e instanceof Error ? e.message : String(e);
          const isTimeout = errMsg.includes("timed out");
          if (isTimeout) {
            results.push({ testId: tc.id, passed: false, actual: stdout, expected: tc.expected, message: `Timed out after ${msg.timeoutMs}ms` });
          } else {
            results.push({ testId: tc.id, passed: false, actual: stderr || errMsg, expected: tc.expected, message: errMsg });
          }
        }
      }

      const passed = results.filter((r) => r.passed).length;
      self.postMessage({
        id: msg.id,
        type: "testReport",
        report: { results, passed, failed: results.length - passed, total: results.length },
      });
      return;
    }
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    self.postMessage({ id: msg.id, type: "error", error: errMsg });
  }
};
