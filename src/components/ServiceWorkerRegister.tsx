"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    // Only register in production or when explicitly enabled; in dev it still helps test offline
    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        // Update on new version
        if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          if (worker) {
            worker.addEventListener("statechange", () => {
              if (worker.state === "installed" && navigator.serviceWorker.controller) {
                // New version available — could show toast; for now auto-activate via skipWaiting in SW
              }
            });
          }
        });
        // Listen for offline/online to update UI if needed
        window.addEventListener("online", () => window.dispatchEvent(new CustomEvent("sw:online")));
        window.addEventListener("offline", () => window.dispatchEvent(new CustomEvent("sw:offline")));
      } catch (e) {
        console.warn("[SW] registration failed", e);
      }
    };
    register();
  }, []);

  return null;
}
