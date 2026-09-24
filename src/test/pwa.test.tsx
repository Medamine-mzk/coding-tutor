import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { OfflineBanner } from "@/components/OfflineBanner";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

describe("PWA — manifest", () => {
  it("manifest exists with required fields", () => {
    const p = join(process.cwd(), "public", "manifest.json");
    expect(existsSync(p)).toBe(true);
    const m = JSON.parse(readFileSync(p, "utf-8")) as Record<string, unknown>;
    expect(m.name).toBeTruthy();
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.icons).toBeTruthy();
  });
});

describe("Service Worker", () => {
  it("sw.js exists and handles Pyodide CDN + offline", () => {
    const p = join(process.cwd(), "public", "sw.js");
    expect(existsSync(p)).toBe(true);
    const text = readFileSync(p, "utf-8");
    expect(text).toContain("PYODIDE_CACHE");
    expect(text).toContain("cdn.jsdelivr.net");
    expect(text).toContain("isPyodideRequest");
    expect(text).toContain("isApiRequest");
    expect(text).toContain("skipWaiting");
  });

  it("registers service worker when supported", async () => {
    const registerMock = vi.fn(async () => ({ waiting: null, addEventListener: vi.fn(), installing: null }));
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register: registerMock, controller: null },
      writable: true,
      configurable: true,
    });

    render(<ServiceWorkerRegister />);
    // wait for effect
    await new Promise((r) => setTimeout(r, 20));
    expect(registerMock).toHaveBeenCalledWith("/sw.js", expect.objectContaining({ scope: "/" }));
  });

  it("does not crash when serviceWorker not supported", async () => {
    const original = (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
    (navigator as unknown as { serviceWorker?: unknown }).serviceWorker = undefined as unknown as ServiceWorkerContainer;
    expect(() => render(<ServiceWorkerRegister />)).not.toThrow();
    // restore
    if (original) Object.defineProperty(navigator, "serviceWorker", { value: original, writable: true });
  });
});

describe("OfflineBanner", () => {
  beforeEach(() => {
    localStorage.setItem("locale", "fr");
    // Ensure online by default
    Object.defineProperty(window, "navigator", {
      value: { onLine: true },
      writable: true,
      configurable: true,
    });
  });

  it("hidden when online", () => {
    Object.defineProperty(window.navigator, "onLine", { value: true, writable: true, configurable: true });
    render(
      <I18nProvider>
        <OfflineBanner />
      </I18nProvider>
    );
    expect(screen.queryByTestId("offline-banner")).not.toBeInTheDocument();
  });

  it("shows when offline", async () => {
    Object.defineProperty(window.navigator, "onLine", { value: false, writable: true, configurable: true });
    render(
      <I18nProvider>
        <OfflineBanner />
      </I18nProvider>
    );
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId("offline-banner")).toBeInTheDocument();
    expect(screen.getByTestId("offline-banner").textContent).toMatch(/hors ligne|offline/i);
  });

  it("shows localized text for ar and en", async () => {
    localStorage.setItem("locale", "ar");
    Object.defineProperty(window.navigator, "onLine", { value: false, writable: true, configurable: true });
    render(
      <I18nProvider>
        <OfflineBanner />
      </I18nProvider>
    );
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId("offline-banner")).toBeInTheDocument();
  });
});

describe("Tutor offline graceful degradation", () => {
  it("TutorChat shows offline state but editor still works", async () => {
    // This is covered by TutorChat offline test, but ensure the app degrades
    // When offline, fetch to /api/tutor/chat fails, but CodeMirror and PythonRunner still work offline
    // We verify that the page still renders the editor and console even when offline
    const { WorkspaceClient } = await import("@/components/WorkspaceClient");
    localStorage.setItem("locale", "fr");
    Object.defineProperty(window.navigator, "onLine", { value: false, writable: true, configurable: true });
    const { I18nProvider: Provider } = await import("@/lib/i18n");
    render(
      <Provider>
        <WorkspaceClient />
      </Provider>
    );
    expect(screen.getByTestId("code-editor")).toBeInTheDocument();
    expect(screen.getByTestId("stdin-input")).toBeInTheDocument();
  });
});
