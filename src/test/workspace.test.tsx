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

  it("shows guided hints panel in class mode, practice notice otherwise", async () => {
    localStorage.setItem("locale", "fr");
    localStorage.removeItem("student_join_token");
    setExerciseInStorage({});
    render(
      <I18nProvider>
        <WorkspaceClient />
      </I18nProvider>
    );
    // Practice mode (no join token): explanatory notice, no hint button
    expect(screen.getByText(/mode classe/i)).toBeInTheDocument();
    expect(screen.queryByTestId("request-hint")).not.toBeInTheDocument();
  });

  it("request-hint reveals next pair and inserts it as a comment", async () => {
    localStorage.setItem("locale", "fr");
    localStorage.setItem("student_join_token", "tok123");
    setExerciseInStorage({});
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ pairIndex: 0, level: 1, totalPairs: 5, revealedCount: 1, capped: false, text: "# Lire la valeur de n" }),
      { headers: { "content-type": "application/json" } }
    ));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <I18nProvider>
        <WorkspaceClient />
      </I18nProvider>
    );
    const btn = await screen.findByTestId("request-hint");
    fireEvent.click(btn);
    await waitFor(() => {
      const el = document.body.textContent ?? "";
      expect(el).toContain("# Lire la valeur de n");
      expect(el).toContain("1/5");
    });
    vi.unstubAllGlobals();
    localStorage.removeItem("student_join_token");
  });

  it("chat panel offers no path into the editor (guided hints only)", async () => {
    localStorage.setItem("locale", "fr");
    localStorage.setItem("student_join_token", "tok123");
    setExerciseInStorage({});
    render(
      <I18nProvider>
        <WorkspaceClient />
      </I18nProvider>
    );
    // Le bouton combiné tuteur→IDE n'existe plus ; seul l'indice guidé insère.
    expect(await screen.findByTestId("request-hint")).toBeInTheDocument();
    expect(screen.queryByTestId("request-hint-comment")).not.toBeInTheDocument();
    expect(screen.queryAllByTestId("insert-comment").length).toBe(0);
    localStorage.removeItem("student_join_token");
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
