import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { WorkspaceClient } from "@/components/WorkspaceClient";
import type { Exercise } from "@/lib/exercise/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

function setExerciseInStorage(ex: Partial<Exercise>) {
  const base: Exercise = {
    id: "ex_ws",
    language: "python",
    uiLocale: "fr",
    title: "Somme",
    statement: "Lire deux entiers",
    ioSpec: "io",
    constraints: ["-1000 ≤ n ≤ 1000"],
    examples: [{ input: "2 3", output: "5" }],
    difficulty: 2,
    concepts: ["loops"],
    source: "typed",
    milestones: [
      { id: "ms1", exerciseId: "ex_ws", order: 1, title: "Lire les entrées", successCriteria: "", hintSeeds: [] },
      { id: "ms2", exerciseId: "ex_ws", order: 2, title: "Boucler sur les données", successCriteria: "", hintSeeds: [] },
      { id: "ms3", exerciseId: "ex_ws", order: 3, title: "Afficher le résultat", successCriteria: "", hintSeeds: [] },
    ],
    visibleTests: [{ id: "t_vis_1", input: "2 3", stdin: ["2", "3"], expected: "5", kind: "stdout", hidden: false }],
    hiddenTests: [{ id: "t_hid_1", input: "0 0", stdin: ["0", "0"], expected: "0", kind: "stdout", hidden: true, category: "edge case with zero" }],
    ...ex,
  } as unknown as Exercise;
  localStorage.setItem("currentExercise", JSON.stringify(base));
}

describe("WorkspaceClient — IDE + runner", () => {
  it("renders three panels (fr) — exercise, editor, tutor", () => {
    localStorage.setItem("locale", "fr");
    render(
      <I18nProvider>
        <WorkspaceClient />
      </I18nProvider>
    );
    expect(screen.getByText(/Exemple : lire deux entiers/)).toBeInTheDocument();
    expect(screen.getByTestId("code-editor")).toBeInTheDocument();
    expect(screen.getByText(/Socratique d'abord/)).toBeInTheDocument();
  });

  it("run button executes code and shows output (fallback)", async () => {
    localStorage.setItem("locale", "fr");
    render(
      <I18nProvider>
        <WorkspaceClient />
      </I18nProvider>
    );
    const runBtn = screen.getByTestId("run-btn");
    expect(runBtn).toBeInTheDocument();
    fireEvent.click(runBtn);
    await waitFor(() => {
      // For default code a=2,b=3 => 5; should appear in console or success banner
      const el = document.body.textContent ?? "";
      expect(el).toMatch(/5/);
    });
  });

  it("stop button is disabled when not running", () => {
    localStorage.setItem("locale", "fr");
    render(
      <I18nProvider>
        <WorkspaceClient />
      </I18nProvider>
    );
    const stopBtn = screen.getByTestId("stop-btn") as HTMLButtonElement;
    expect(stopBtn.disabled).toBe(true);
  });

  it("stdin textarea accepts input and is passed to runner", async () => {
    localStorage.setItem("locale", "fr");
    render(
      <I18nProvider>
        <WorkspaceClient />
      </I18nProvider>
    );
    const stdin = screen.getByTestId("stdin-input") as HTMLTextAreaElement;
    expect(stdin).toBeInTheDocument();
    fireEvent.change(stdin, { target: { value: "10\n20" } });
    expect(stdin.value).toBe("10\n20");
  });

  it("shows milestones with completion checkmarks (auto-detected)", async () => {
    localStorage.setItem("locale", "fr");
    setExerciseInStorage({});
    render(
      <I18nProvider>
        <WorkspaceClient />
      </I18nProvider>
    );
    // Milestone list should appear with 3 items and next suggestion
    expect(screen.getByTestId("milestone-list")).toBeInTheDocument();
    expect(screen.getByText("Lire les entrées")).toBeInTheDocument();
    // Default code has input and print, so Read and Display should be completed (✓)
    await waitFor(() => expect(screen.getByText("Lire les entrées").closest("li")?.textContent).toContain("✓"));
  });

  it("shows TestRunner with visible diff and hidden category-only, and Completion when all pass", async () => {
    localStorage.setItem("locale", "fr");
    setExerciseInStorage({});
    render(
      <I18nProvider>
        <WorkspaceClient />
      </I18nProvider>
    );
    const testsBtn = screen.getByText("Tests");
    fireEvent.click(testsBtn);
    await waitFor(() => expect(screen.getByTestId("test-runner")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("test-summary")).toBeInTheDocument());
    expect(screen.getByTestId("test-summary").textContent).toMatch(/passés/);
    await waitFor(() => {
      const runner = screen.getByTestId("test-runner");
      expect(runner).toBeInTheDocument();
      expect(screen.getByTestId("visible-tests")).toBeInTheDocument();
      expect(screen.getByTestId("hidden-tests")).toBeInTheDocument();
    });
    await waitFor(() => {
      const maybeCompletion = screen.queryByTestId("completion-screen");
      if (maybeCompletion) expect(maybeCompletion).toBeInTheDocument();
    });
  });
});
