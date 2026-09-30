import { describe, it, expect, vi, afterEach } from "vitest";
import { runPythonRemote, RemoteExecError, isRemoteExecEnabled } from "@/lib/exercise/remotePython";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.REMOTE_EXEC;
});

function mockFetchOnce(payload: unknown, ok = true, status = 200) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok, status, json: async () => payload }) as Response));
}

describe("runPythonRemote (Wandbox)", () => {
  it("maps a successful run to stdout/exitCode 0", async () => {
    mockFetchOnce({ status: "0", signal: "", program_output: "42\n", program_error: "", compiler_error: "" });
    const res = await runPythonRemote("print(40 + 2)", [], 8000);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toBe("42\n");
    expect(res.remote).toBe(true);
    expect(res.missingModule).toBeUndefined();
  });

  it("maps a runtime error to exitCode 1 with stderr", async () => {
    mockFetchOnce({ status: "1", program_output: "", program_error: "NameError: name 'x' is not defined\n", compiler_error: "" });
    const res = await runPythonRemote("print(x)", [], 8000);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("NameError");
  });

  it("flags missing modules (e.g. numpy) instead of blaming the code", async () => {
    mockFetchOnce({ status: "1", program_output: "", program_error: "ModuleNotFoundError: No module named 'numpy'\n", compiler_error: "" });
    const res = await runPythonRemote("from numpy import array", [], 8000);
    expect(res.missingModule).toBe("numpy");
  });

  it("throws RemoteExecError on HTTP failure (no false negative)", async () => {
    mockFetchOnce({ error: "busy" }, false, 503);
    await expect(runPythonRemote("print(1)", [], 8000)).rejects.toBeInstanceOf(RemoteExecError);
  });

  it("throws RemoteExecError when fetch itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("fetch failed"); }));
    await expect(runPythonRemote("print(1)", [], 8000)).rejects.toBeInstanceOf(RemoteExecError);
  });

  it("sends code + stdin joined with newlines", async () => {
    const spy = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: "0", program_output: "5\n" }) }) as Response);
    vi.stubGlobal("fetch", spy);
    await runPythonRemote("print(int(input()) + int(input()))", ["2", "3"], 8000);
    const call = spy.mock.calls[0] as unknown as [string, { body: string }];
    const body = JSON.parse(call[1].body) as { stdin: string; save: boolean };
    expect(body.stdin).toBe("2\n3");
    expect(body.save).toBe(false);
  });
});

describe("isRemoteExecEnabled", () => {
  it("defaults to ON, OFF only with REMOTE_EXEC=0", () => {
    expect(isRemoteExecEnabled()).toBe(true);
    process.env.REMOTE_EXEC = "0";
    expect(isRemoteExecEnabled()).toBe(false);
  });
});
