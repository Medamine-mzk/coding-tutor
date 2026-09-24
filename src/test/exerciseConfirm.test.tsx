import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExerciseConfirm } from "@/components/ExerciseConfirm";
import { I18nProvider } from "@/lib/i18n";
import type { Exercise } from "@/lib/exercise/types";

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: "ex_test",
    language: "python",
    uiLocale: "fr",
    title: "Somme de deux nombres",
    statement: "Lire deux entiers et afficher leur somme.",
    ioSpec: "Entrée: 2 3 → Sortie: 5",
    constraints: ["-1000 ≤ n ≤ 1000"],
    examples: [{ input: "2 3", output: "5" }, { input: "0 0", output: "0" }],
    difficulty: 2,
    concepts: ["loops"],
    source: "typed",
    milestones: [
      { id: "ms1", exerciseId: "ex_test", order: 1, title: "Lire les entrées", successCriteria: "ok", hintSeeds: [] },
      { id: "ms2", exerciseId: "ex_test", order: 2, title: "Calculer", successCriteria: "ok", hintSeeds: [] },
    ],
    visibleTests: [{ id: "t1", expected: "5", kind: "stdout", hidden: false }],
    ...overrides,
  };
}

describe("ExerciseConfirm", () => {
  beforeEach(() => localStorage.clear());

  it("renders editable fields", () => {
    const ex = makeExercise();
    render(
      <I18nProvider>
        <ExerciseConfirm exercise={ex} onConfirm={vi.fn()} onCancel={vi.fn()} />
      </I18nProvider>
    );
    expect(screen.getByDisplayValue("Somme de deux nombres")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Lire deux entiers et afficher leur somme.")).toBeInTheDocument();
    expect(screen.getByTestId("input-iospec")).toBeInTheDocument();
    expect(screen.getByTestId("example-input-0")).toHaveValue("2 3");
    expect(screen.getByTestId("example-output-0")).toHaveValue("5");
  });

  it("allows editing title and examples", () => {
    const ex = makeExercise();
    render(
      <I18nProvider>
        <ExerciseConfirm exercise={ex} onConfirm={vi.fn()} onCancel={vi.fn()} />
      </I18nProvider>
    );
    const titleInput = screen.getByTestId("input-title") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "Nouveau titre" } });
    expect(titleInput.value).toBe("Nouveau titre");

    const exInput = screen.getByTestId("example-input-0") as HTMLInputElement;
    fireEvent.change(exInput, { target: { value: "10 20" } });
    expect(exInput.value).toBe("10 20");
  });

  it("adds and removes examples", () => {
    const ex = makeExercise();
    render(
      <I18nProvider>
        <ExerciseConfirm exercise={ex} onConfirm={vi.fn()} onCancel={vi.fn()} />
      </I18nProvider>
    );
    const addBtn = screen.getByText("+ Ajouter");
    fireEvent.click(addBtn);
    expect(screen.getByTestId("example-input-2")).toBeInTheDocument();
    // Remove first
    const removeBtns = screen.getAllByLabelText("Remove example");
    fireEvent.click(removeBtns[0]);
    expect(screen.queryByDisplayValue("2 3")).not.toBeInTheDocument();
  });

  it("stores in localStorage and calls onConfirm", () => {
    const onConfirm = vi.fn();
    const ex = makeExercise();
    render(
      <I18nProvider>
        <ExerciseConfirm exercise={ex} onConfirm={onConfirm} onCancel={vi.fn()} />
      </I18nProvider>
    );
    fireEvent.click(screen.getByTestId("btn-confirm"));
    expect(localStorage.getItem("currentExercise")).toContain("Somme de deux nombres");
    expect(localStorage.getItem("currentExerciseId")).toBe("ex_test");
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ id: "ex_test" }));
  });

  it("calls onCancel", () => {
    const onCancel = vi.fn();
    const ex = makeExercise();
    render(
      <I18nProvider>
        <ExerciseConfirm exercise={ex} onConfirm={vi.fn()} onCancel={onCancel} />
      </I18nProvider>
    );
    fireEvent.click(screen.getByTestId("btn-cancel"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("respects RTL for Arabic locale exercise", () => {
    const ex = makeExercise({ uiLocale: "ar", title: "مجموع عددين" });
    localStorage.setItem("locale", "ar");
    render(
      <I18nProvider>
        <ExerciseConfirm exercise={ex} onConfirm={vi.fn()} onCancel={vi.fn()} />
      </I18nProvider>
    );
    const card = screen.getByTestId("confirm-card");
    expect(card.getAttribute("dir")).toBe("rtl");
  });
});
