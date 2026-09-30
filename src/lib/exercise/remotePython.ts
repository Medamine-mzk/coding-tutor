import type { RunPythonResult } from "./runPython";

export type RemotePythonResult = RunPythonResult & {
  /** Always true: this verdict came from a remote sandbox, not local `python`. */
  remote: true;
  /** Set when the remote interpreter lacks a module (e.g. numpy on Wandbox).
   * Callers should fall back to LLM dry-run, NOT blame the code under test. */
  missingModule?: string;
};

/** Thrown when no verdict could be obtained (network, timeout, bad gateway…).
 * This is NOT a negative verdict — callers must try the next fallback. */
export class RemoteExecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemoteExecError";
  }
}

export function isRemoteExecEnabled(): boolean {
  return process.env.REMOTE_EXEC !== "0";
}

function remoteBaseUrl(): string {
  return (process.env.WANDBOX_URL ?? "https://wandbox.org").replace(/\/+$/, "");
}

function remoteCompiler(): string {
  return process.env.WANDBOX_COMPILER ?? "cpython-3.11.10";
}

type WandboxResponse = {
  status?: string;
  signal?: string;
  compiler_output?: string;
  compiler_error?: string;
  compiler_message?: string;
  program_output?: string;
  program_error?: string;
  program_message?: string;
};

const MISSING_MODULE_RE = /ModuleNotFoundError:\s*No module named '([^']+)'/;

/**
 * Execute Python code with stdin via the public Wandbox API (no key, HTTPS).
 * Teacher-publish path ONLY: low volume, teacher-authored code. Never call
 * this with student code (privacy + rate limits) — see antiLeak.ts.
 */
export async function runPythonRemote(code: string, stdin: string[], timeoutMs: number): Promise<RemotePythonResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${remoteBaseUrl()}/api/compile.json`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code,
        compiler: remoteCompiler(),
        stdin: stdin.join("\n"),
        save: false,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new RemoteExecError(`Wandbox HTTP ${res.status}`);
    }
    const data = (await res.json()) as WandboxResponse;
    const stdout = (data.program_output ?? "").replace(/\r\n/g, "\n");
    const stderr = [data.program_error ?? "", data.compiler_error ?? ""].filter(Boolean).join("\n").replace(/\r\n/g, "\n");
    const missing = stderr.match(MISSING_MODULE_RE)?.[1];
    const exitCode = data.status === "0" ? 0 : 1;
    const timedOut = /timed out|timeout/i.test(`${data.signal ?? ""} ${stderr}`);
    return { stdout, stderr, exitCode, timedOut, remote: true, missingModule: missing };
  } catch (e) {
    if (e instanceof RemoteExecError) throw e;
    throw new RemoteExecError(e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
}
