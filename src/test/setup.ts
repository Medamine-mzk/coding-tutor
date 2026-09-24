import "@testing-library/jest-dom/vitest";

// jsdom polyfills for CodeMirror and matchMedia
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

if (typeof globalThis !== "undefined" && typeof (globalThis as unknown as { ClipboardEvent?: unknown }).ClipboardEvent === "undefined") {
  // Minimal stub so tests that reference ClipboardEvent do not crash
  (globalThis as unknown as { ClipboardEvent: unknown }).ClipboardEvent = class ClipboardEvent extends Event {
    clipboardData: { getData: () => string };
    constructor(type: string, init?: { clipboardData?: { getData: () => string } }) {
      super(type, init as unknown as EventInit);
      this.clipboardData = init?.clipboardData ?? { getData: () => "" };
    }
  };
}

// ResizeObserver stub for CodeMirror view
if (typeof window !== "undefined" && !window.ResizeObserver) {
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (window as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = ResizeObserver;
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = ResizeObserver;
}
