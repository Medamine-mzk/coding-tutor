import { describe, it, expect, vi, beforeEach } from "vitest";
import { trackPageView, trackEvent, optOut, optIn } from "@/lib/analytics";
import { reportError, installGlobalHandlers } from "@/lib/monitoring";

describe("analytics — privacy-friendly", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    delete (globalThis as unknown as { doNotTrack?: string }).doNotTrack;
    Object.defineProperty(navigator, "doNotTrack", { value: "0", writable: true, configurable: true });
  });

  it("trackPageView logs without PII", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    trackPageView("/workspace", "fr");
    expect(spy).toHaveBeenCalledWith("[analytics]", expect.objectContaining({ event: "page_view", path: "/workspace", locale: "fr" }));
    const payload = spy.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("ip");
    expect(payload).not.toHaveProperty("userId");
  });

  it("respects DNT", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    Object.defineProperty(navigator, "doNotTrack", { value: "1", writable: true, configurable: true });
    trackPageView("/", "fr");
    expect(spy).not.toHaveBeenCalled();
  });

  it("respects opt-out", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    optOut();
    trackEvent("code_run", { exerciseId: "ex1" });
    expect(spy).not.toHaveBeenCalled();
    optIn();
    trackEvent("code_run", { exerciseId: "ex1" });
    expect(spy).toHaveBeenCalled();
  });

  it("trackEvent includes timestamp and no fingerprint", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    trackEvent("tests_run", { exerciseId: "ex2" });
    const payload = spy.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.event).toBe("tests_run");
    expect(payload.timestamp).toBeTruthy();
    expect(payload).not.toHaveProperty("fingerprint");
  });
});

describe("monitoring — privacy", () => {
  it("reportError logs without PII beyond snippet", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    reportError(new Error("Test error for monitoring"), "test-context");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("[monitoring]"), expect.stringContaining("Test error"));
  });

  it("installGlobalHandlers does not throw", () => {
    expect(() => installGlobalHandlers()).not.toThrow();
  });
});
