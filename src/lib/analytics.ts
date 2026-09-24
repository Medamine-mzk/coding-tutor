/**
 * Privacy-friendly analytics — no cookies, no personal data.
 * Logs page views and key events anonymously. Respects DNT and Tunisian INPDP.
 * Replace endpoint with Plausible/Umami or your own beacon if desired.
 */

type EventName = "page_view" | "exercise_parsed" | "exercise_uploaded" | "code_run" | "tests_run" | "tutor_message" | "library_pick";

type AnalyticsPayload = {
  event: EventName;
  path?: string;
  locale?: string;
  exerciseId?: string;
  timestamp: string;
  // No IP, no userId, no fingerprint — INPDP compliant
};

const ENDPOINT = process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT ?? "";

function shouldTrack(): boolean {
  if (typeof window === "undefined") return false;
  // Respect Do Not Track
  if (navigator.doNotTrack === "1" || (window as unknown as { doNotTrack?: string }).doNotTrack === "1") return false;
  // Respect localStorage opt-out
  try {
    if (localStorage.getItem("analytics-opt-out") === "1") return false;
  } catch {}
  return true;
}

function send(payload: AnalyticsPayload) {
  if (!shouldTrack()) return;
  const body = JSON.stringify(payload);
  // Use sendBeacon for page unload reliability, fallback to fetch
  try {
    if (navigator.sendBeacon && ENDPOINT) {
      const blob = new Blob([body], { type: "application/json" });
      const ok = navigator.sendBeacon(ENDPOINT, blob);
      if (ok) return;
    }
    if (ENDPOINT) {
      fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
    } else {
      // Dev fallback: log to console (privacy-friendly, no network)
      console.debug("[analytics]", payload);
    }
  } catch {}
}

export function trackPageView(path: string, locale?: string) {
  send({ event: "page_view", path, locale, timestamp: new Date().toISOString() });
}

export function trackEvent(event: EventName, meta: Partial<AnalyticsPayload> = {}) {
  send({ event, timestamp: new Date().toISOString(), ...meta });
}

export function optOut() {
  try {
    localStorage.setItem("analytics-opt-out", "1");
  } catch {}
}

export function optIn() {
  try {
    localStorage.removeItem("analytics-opt-out");
  } catch {}
}
