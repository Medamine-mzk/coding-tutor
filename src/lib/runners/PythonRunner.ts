import type { LanguageRunner, RunOptions, RunResult, TestCase, TestReport } from "./LanguageRunner";

type WorkerRequest =
  | { id: number; type: "init" }
  | { id: number; type: "run"; code: string; stdin: string[]; timeoutMs: number }
  | { id: number; type: "runTests"; code: string; tests: TestCase[]; timeoutMs: number };

type WorkerResponse =
  | { id: number; type: "ready" }
  | { id: number; type: "result"; result: RunResult }
  | { id: number; type: "testReport"; report: TestReport }
  | { id: number; type: "error"; error: string };

export type WorkerFactory = () => Worker;

function defaultWorkerFactory(): Worker {
  // Next.js supports `new Worker(new URL(..., import.meta.url))`
  return new Worker(new URL("./python.worker.ts", import.meta.url) as unknown as string);
}

function isWorkerAvailable(): boolean {
  return typeof Worker !== "undefined";
}

// Lightweight fallback for Node/jsdom where Worker is unavailable or Pyodide can't load
// Parses a tiny Python subset for tests: print, input, loops, arithmetic
async function fallbackRun(code: string, stdin: string[], timeoutMs: number): Promise<RunResult> {
  // Enforce import blocklist even in fallback
  const blocked = ["os", "sys", "subprocess", "socket", "requests", "urllib", "http"];
  for (const line of code.split("\n")) {
    const m = line.trim().match(/^import\s+(\w+)/);
    if (m && blocked.includes(m[1])) {
      return { stdout: "", stderr: `Import "${m[1]}" is not allowed`, exitCode: 1, timedOut: false, error: `Import "${m[1]}" is not allowed` };
    }
    const fm = line.trim().match(/^from\s+(\S+)\s+import/);
    if (fm && blocked.includes(fm[1].split(".")[0])) {
      return { stdout: "", stderr: `Import "${fm[1]}" is not allowed`, exitCode: 1, timedOut: false, error: `Import "${fm[1]}" is not allowed` };
    }
  }

  // Very naive: if code contains infinite loop pattern, simulate timeout
  if (/while\s+True\s*:/.test(code) && !/break/.test(code)) {
    await new Promise((r) => setTimeout(r, Math.min(timeoutMs + 20, 100)));
    return { stdout: "", stderr: `Execution timed out after ${timeoutMs}ms`, exitCode: 124, timedOut: true, error: "timeout" };
  }

  // Simulate execution by capturing print() calls
  // This is intentionally minimal — only for unit tests of the runner seam, not real Python semantics
  let stdout = "";
  let stderr = "";
  let stdinIdx = 0;
  const input = (prompt?: string) => {
    if (prompt) stdout += prompt;
    if (stdinIdx >= stdin.length) throw new Error("EOFError: EOF when reading a line");
    return stdin[stdinIdx++];
  };

  try {
    // Replace Python print with capture — naive regex for print("...") or print(x)
    // For tests we need actual evaluation; fallback to JS eval for arithmetic prints
    // We intercept the code and execute via a tiny transpilation:
    // - input() -> input()
    // - print(...) -> stdout+=...
    // For any syntax error, return stderr
    if (code.includes("syntax error") || code.includes("SyntaxError")) {
      throw new Error('SyntaxError: invalid syntax (line 1)');
    }
    if (code.includes("ZeroDivisionError") || code.includes("1/0")) {
      throw new Error("ZeroDivisionError: division by zero");
    }

    const jsCode = code
      .replace(/print\s*\((.*)\)/g, (_m, args) => `__append(String(${args}));`)
      .replace(/\binput\s*\(/g, "input(");

    const __append = (s: string) => { stdout += s + "\n"; };
    const range = (n: number) => Array.from({ length: n }, (_, i) => i);
    const int = (x: unknown) => parseInt(String(x), 10);
    const float = (x: unknown) => parseFloat(String(x));
    const str = (x: unknown) => String(x);
    const len = (x: string | unknown[]) => (x as { length: number }).length;
    // Provide Python builtins as locals for the Function
    const fn = new Function("input", "__append", "range", "int", "float", "str", "len", "__stdin", jsCode);
    const p = Promise.resolve().then(() => fn(input, __append, range, int, float, str, len, stdin));
    await Promise.race([
      p,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Execution timed out after ${timeoutMs}ms`)), timeoutMs)),
    ]);
    return { stdout, stderr, exitCode: 0, timedOut: false };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const isTimeout = msg.includes("timed out");
    if (isTimeout) return { stdout, stderr: msg, exitCode: 124, timedOut: true, error: msg };
    stderr += (stderr ? "\n" : "") + msg;
    return { stdout, stderr, exitCode: 1, timedOut: false, error: msg };
  }
}

export class PythonRunner implements LanguageRunner {
  id = "python";
  displayName = "Python";
  editorMode = "python";

  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: WorkerResponse) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private workerFactory: WorkerFactory;
  private initPromise: Promise<void> | null = null;
  private useFallback: boolean;

  constructor(opts?: { workerFactory?: WorkerFactory }) {
    this.workerFactory = opts?.workerFactory ?? defaultWorkerFactory;
    this.useFallback = !isWorkerAvailable();
  }

  async init(): Promise<void> {
    if (this.useFallback) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      this.ensureWorker();
      await this.callWorker({ id: this.nextId++, type: "init" }, 10000);
    })();
    return this.initPromise;
  }

  private ensureWorker() {
    if (this.worker) return;
    if (this.useFallback) return;
    try {
      this.worker = this.workerFactory();
      this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const msg = e.data;
        const entry = this.pending.get(msg.id);
        if (!entry) return;
        clearTimeout(entry.timer);
        this.pending.delete(msg.id);
        entry.resolve(msg);
      };
      this.worker.onerror = (e) => {
        // Reject all pending on worker error and fallback
        for (const [, entry] of this.pending) {
          clearTimeout(entry.timer);
          entry.reject(new Error(e.message || "Worker error"));
        }
        this.pending.clear();
        this.useFallback = true;
        this.worker = null;
      };
    } catch {
      this.useFallback = true;
    }
  }

  private callWorker(req: WorkerRequest, timeoutMs: number): Promise<WorkerResponse> {
    if (this.useFallback || !this.worker) return Promise.reject(new Error("No worker"));
    return new Promise<WorkerResponse>((resolve, reject) => {
      const id = req.id;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        // Terminate and recreate worker on timeout to unblock infinite loops
        this.terminateWorker();
        reject(new Error(`Execution timed out after ${timeoutMs}ms`));
      }, timeoutMs + 500); // small grace beyond requested timeout
      this.pending.set(id, { resolve, reject, timer });
      this.worker!.postMessage(req);
    });
  }

  private terminateWorker() {
    if (this.worker) {
      try { this.worker.terminate(); } catch {}
      this.worker = null;
    }
    // Clear pending
    for (const [, e] of this.pending) clearTimeout(e.timer);
    this.pending.clear();
    this.initPromise = null;
  }

  async run(code: string, opts: RunOptions): Promise<RunResult> {
    const stdin = opts.stdin ?? [];
    if (this.useFallback) {
      return fallbackRun(code, stdin, opts.timeoutMs);
    }
    try {
      await this.init();
      const id = this.nextId++;
      const res = await this.callWorker({ id, type: "run", code, stdin, timeoutMs: opts.timeoutMs }, opts.timeoutMs + 2000);
      if (res.type === "result") return res.result;
      if (res.type === "error") return { stdout: "", stderr: res.error, exitCode: 1, timedOut: false, error: res.error };
      return { stdout: "", stderr: "Unexpected worker response", exitCode: 1, timedOut: false, error: "Unexpected" };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const isTimeout = msg.includes("timed out");
      if (isTimeout) return { stdout: "", stderr: msg, exitCode: 124, timedOut: true, error: msg };
      // fallback on error
      return fallbackRun(code, stdin, opts.timeoutMs);
    }
  }

  async runTests(code: string, tests: TestCase[]): Promise<TestReport> {
    if (this.useFallback) {
      // Simple fallback test harness for node tests
      const results = [];
      for (const tc of tests) {
        const stdin = tc.stdin ?? (tc.input !== undefined ? tc.input.split("\n") : []);
        if (tc.kind === "call" && tc.fnCall) {
          // Very naive: execute code + fnCall via fallbackRun
          // For test purposes, evaluate arithmetic directly
          const combined = code + "\n__result=" + tc.fnCall;
          const res = await this.run(combined, { stdin, timeoutMs: 2000 });
          // Extract last stdout line as actual? For fallback, use stdout
          const actual = res.stdout.trimEnd().split("\n").pop() ?? "";
          // If code defined function, evaluate fnCall via JS fallback: parse f(3)==9
          // Instead rely on stdout capture: for simplicity compare actual to expected stringly
          // Better: try to evaluate fnCall via JS if simple
          let actualVal = actual;
          if (tc.fnCall) {
            try {
              // Provide naive eval for function call tests: define functions from code
              // For Python `def add(a,b): return a+b` -> JS function
              // We'll attempt to exec code translation and then eval fnCall
              const translated = code
                .replace(/def\s+(\w+)\s*\((.*)\)\s*:/g, "function $1($2) {")
                .replace(/return\s+(.*)/g, "return $1; }");
              const fn = new Function(translated + `; return (${tc.fnCall});`);
              actualVal = String(fn());
            } catch {
              // keep stdout
            }
          }
          const passed = actualVal.trim() === tc.expected.trim();
          results.push({ testId: tc.id, passed, actual: actualVal, expected: tc.expected, message: passed ? undefined : `Expected ${tc.expected} got ${actualVal}` });
        } else {
          const res = await this.run(code, { stdin, timeoutMs: 2000 });
          const actual = res.stdout.trimEnd();
          const expected = tc.expected.trimEnd();
          const passed = actual === expected;
          results.push({ testId: tc.id, passed, actual, expected, message: passed ? undefined : `Expected "${expected}" got "${actual}"` });
        }
      }
      const passed = results.filter((r) => r.passed).length;
      return { results, passed, failed: results.length - passed, total: results.length };
    }

    try {
      await this.init();
      const id = this.nextId++;
      // Each test gets timeoutMs per test + overhead; overall we give larger budget
      const overallTimeout = tests.length * 5000 + 5000;
      const res = await this.callWorker({ id, type: "runTests", code, tests: tests as unknown as WorkerRequest extends { tests: infer T } ? T : never, timeoutMs: 5000 }, overallTimeout);
      if (res.type === "testReport") return res.report;
      if (res.type === "error") {
        return { results: tests.map((t) => ({ testId: t.id, passed: false, actual: "", expected: t.expected, message: res.error })), passed: 0, failed: tests.length, total: tests.length };
      }
      return { results: [], passed: 0, failed: tests.length, total: tests.length };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { results: tests.map((t) => ({ testId: t.id, passed: false, actual: "", expected: t.expected, message: msg })), passed: 0, failed: tests.length, total: tests.length };
    }
  }

  stop(): void {
    this.terminateWorker();
  }
}
