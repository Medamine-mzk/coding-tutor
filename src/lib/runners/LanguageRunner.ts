/**
 * LanguageRunner — pluggable execution seam per PROJECT_SPEC.md:70
 * Every language adapter (Python first via Pyodide) implements this.
 * Depth is in hiding Web Worker, Pyodide init, timeout, stdin queue, and test harness
 * behind a tiny interface. See ADR-0001.
 */

export type RunOptions = {
  stdin?: string[];
  timeoutMs: number;
};

export type RunResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  error?: string;
};

export type TestCase = {
  id: string;
  input?: string;
  stdin?: string[];
  expected: string;
  kind: "stdout" | "call";
  fnCall?: string;
  hidden: boolean;
  category?: string;
};

export type TestResult = {
  testId: string;
  passed: boolean;
  actual?: string;
  expected?: string;
  message?: string;
};

export type TestReport = {
  results: TestResult[];
  passed: number;
  failed: number;
  total: number;
};

export interface LanguageRunner {
  id: string; // "python"
  displayName: string;
  editorMode: string;
  init(): Promise<void>;
  run(code: string, opts: RunOptions): Promise<RunResult>;
  runTests(code: string, tests: TestCase[]): Promise<TestReport>;
}
