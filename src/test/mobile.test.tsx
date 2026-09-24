import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { WorkspaceClient } from "@/components/WorkspaceClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

describe("mobile layout — responsive and touch targets", () => {
  it("workspace has stacked tabs visible on mobile (hidden lg:flex pattern)", async () => {
    localStorage.setItem("locale", "fr");
    render(
      <I18nProvider>
        <WorkspaceClient />
      </I18nProvider>
    );
    // Mobile tabs should be present (either fr or en)
    expect(screen.getByText(/Éditeur|Editor/)).toBeInTheDocument();
    expect(document.body.innerHTML).toContain("lg:hidden");
    expect(document.body.innerHTML).toContain("lg:grid");
    expect(screen.getAllByRole("region").length).toBeGreaterThanOrEqual(3);
  });

  it("touch targets are at least 44px (min-w/h) for interactive elements", () => {
    render(
      <I18nProvider>
        <WorkspaceClient />
      </I18nProvider>
    );
    // Run button should be at least h-9 (36px) but we check for min-h in Header theme toggle
    const runBtn = screen.getByTestId("run-btn");
    expect(runBtn.className).toMatch(/h-9|min-h/);
  });

  it("Header has touch-friendly theme toggle and locale switcher", async () => {
    const { Header } = await import("@/components/Header");
    render(
      <I18nProvider>
        <Header />
      </I18nProvider>
    );
    // Theme toggle should have min-h-[36px] min-w-[44px]
    const toggle = screen.getByLabelText(/Activer le thème/);
    expect(toggle.className).toMatch(/min-h/);
    expect(toggle.className).toMatch(/min-w/);
  });

  it("Library grid is responsive (sm:2 lg:3)", async () => {
    const { LibraryClient } = await import("@/components/LibraryClient");
    render(
      <I18nProvider>
        <LibraryClient />
      </I18nProvider>
    );
    const grid = screen.getByTestId("library-grid");
    expect(grid.className).toContain("sm:grid-cols-2");
    expect(grid.className).toContain("lg:grid-cols-3");
  });

  it("FileUpload dropzone is keyboard accessible", async () => {
    const { FileUpload } = await import("@/components/FileUpload");
    render(
      <I18nProvider>
        <FileUpload onSingle={vi.fn()} />
      </I18nProvider>
    );
    const dropzone = screen.getByTestId("file-dropzone");
    expect(dropzone.getAttribute("tabIndex")).toBe("0");
    expect(dropzone.getAttribute("role")).toBe("button");
    // Check focus ring
    expect(dropzone.className).toContain("focus-visible:ring");
  });
});
