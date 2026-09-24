"use client";

import { useEffect } from "react";
import { trackPageView, trackEvent } from "@/lib/analytics";
import { installGlobalHandlers } from "@/lib/monitoring";

export function Analytics() {
  useEffect(() => {
    installGlobalHandlers();
    const track = () => {
      if (typeof window === "undefined") return;
      const path = window.location.pathname;
      const locale = document.documentElement.lang || "fr";
      trackPageView(path, locale);
    };
    track();
    window.addEventListener("popstate", track);
    // Patch pushState/replaceState to catch Next.js client navigation
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function (...args) {
      origPush.apply(history, args as never);
      track();
    };
    history.replaceState = function (...args) {
      origReplace.apply(history, args as never);
      track();
    };
    return () => {
      window.removeEventListener("popstate", track);
      history.pushState = origPush;
      history.replaceState = origReplace;
    };
  }, []);

  useEffect(() => {
    (window as unknown as { trackEvent?: typeof trackEvent }).trackEvent = trackEvent;
  }, []);

  return null;
}
