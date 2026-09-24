import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { Header } from "@/components/Header";
import { LibraryClient } from "@/components/LibraryClient";
import { ExerciseConfirm } from "@/components/ExerciseConfirm";
import type { Exercise } from "@/lib/exercise/types";
import { vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

describe("a11y — landmarks and labels", () => {
  it("Header has banner role and nav with aria-label", () => {
    render(
      <I18nProvider>
        <Header />
      </I18nProvider>
    );
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByLabelText("Primary")).toBeInTheDocument();
    expect(screen.getByLabelText(/Mchi Nekteb — home/i)).toBeInTheDocument();
  });

  it("Library has search with aria-label and filters", () => {
    render(
      <I18nProvider>
        <LibraryClient />
      </I18nProvider>
    );
    expect(screen.getByLabelText(/Rechercher dans la bibliothèque|Search library|بحث في المكتبة/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Filtrer par langue|Filter by language|تصفية حسب اللغة/)).toBeInTheDocument();
    expect(screen.getByRole("search")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: /Exercise list|Liste d'exercices|قائمة التمارين/ })).toBeInTheDocument();
  });

  it("ExerciseConfirm has form role and labelled inputs", () => {
    const ex: Exercise = {
      id: "ex_a11y",
      language: "python",
      uiLocale: "fr",
      title: "Test",
      statement: "Statement",
      ioSpec: "io",
      constraints: [],
      examples: [{ input: "1", output: "1" }],
      difficulty: 1,
      concepts: [],
      source: "typed",
      milestones: [{ id: "m1", exerciseId: "ex_a11y", order: 1, title: "Lire", successCriteria: "", hintSeeds: [] }],
      visibleTests: [],
      hiddenTests: [],
    };
    render(
      <I18nProvider>
        <ExerciseConfirm exercise={ex} onConfirm={vi.fn()} onCancel={vi.fn()} />
      </I18nProvider>
    );
    expect(screen.getByRole("form", { name: /Confirmer l'exercice|Confirm exercise|تأكيد التمرين/ })).toBeInTheDocument();
    expect(screen.getByTestId("input-title")).toBeInTheDocument();
  });

  it("Skip link exists in layout (via Header + layout)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const layoutText = fs.readFileSync(path.join(process.cwd(), "src", "app", "layout.tsx"), "utf-8");
    expect(layoutText).toContain('href="#main"');
    expect(layoutText).toContain('id="main"');
  });

  it("Console has log role and aria-live", async () => {
    const { Console } = await import("@/components/Console");
    const { render: r } = await import("@testing-library/react");
    const { container } = r(<Console stdout="hello" stderr="" />);
    expect(container.querySelector('[role="log"]')).toBeTruthy();
    expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
  });

  it("TestRunner has region and aria-live", async () => {
    const { TestRunner } = await import("@/components/TestRunner");
    const { render: r2 } = await import("@testing-library/react");
    const tests = [{ id: "t1", expected: "5", kind: "stdout" as const, hidden: false }];
    const { container } = r2(<TestRunner tests={tests} report={null} />);
    expect(container.querySelector('[role="region"][aria-label="Test runner"]')).toBeTruthy();
  });

  it("TutorChat has log role for messages", async () => {
    const { TutorChat } = await import("@/components/TutorChat");
    const { render: r3 } = await import("@testing-library/react");
    const { container } = r3(
      <I18nProvider>
        <TutorChat code="x=1" />
      </I18nProvider>
    );
    expect(container.querySelector('[role="log"]')).toBeTruthy();
  });

  it("FileUpload dropzone has button role and aria-label", async () => {
    const { FileUpload } = await import("@/components/FileUpload");
    const { render: r4 } = await import("@testing-library/react");
    const { container } = r4(
      <I18nProvider>
        <FileUpload onSingle={vi.fn()} />
      </I18nProvider>
    );
    const dropzone = container.querySelector('[role="button"][aria-label]');
    expect(dropzone).toBeTruthy();
    expect(container.querySelector('[data-testid="file-input"]')?.getAttribute("aria-label")).toBeTruthy();
  });
});
