/**
 * Error monitoring — privacy-friendly, no PII.
 * Logs errors to console in dev, and to an endpoint if configured.
 * Never logs code content beyond snippet length.
 */

type ErrorInfo = {
  message: string;
  stack?: string;
  context?: string;
  timestamp: string;
};

const ENDPOINT = process.env.NEXT_PUBLIC_ERROR_ENDPOINT ?? "";

function shouldReport(): boolean {
  if (typeof window === "undefined") return false;
  return true;
}

export function reportError(error: unknown, context?: string) {
  const err = error instanceof Error ? error : new Error(String(error));
  const info: ErrorInfo = {
    message: err.message.slice(0, 500),
    stack: err.stack?.slice(0, 1000),
    context: context?.slice(0, 200),
    timestamp: new Date().toISOString(),
  };
  // Always log to console for dev
  console.error(`[monitoring] ${context ?? "error"}:`, err.message);

  if (!shouldReport() || !ENDPOINT) return;
  try {
    const body = JSON.stringify(info);
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(ENDPOINT, blob)) return;
    }
    fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch {}
}

export function installGlobalHandlers() {
  if (typeof window === "undefined") return;
  window.addEventListener("error", (event) => {
    reportError(event.error ?? event.message, "window.onerror");
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportError(event.reason, "unhandledrejection");
  });
}
