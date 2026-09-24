import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CompletionScreen } from "@/components/CompletionScreen";
import { I18nProvider } from "@/lib/i18n";

describe("CompletionScreen", () => {
  it("celebrates and shows reflection", () => {
    render(
      <I18nProvider>
        <CompletionScreen
          exercise={{ title: "Somme", concepts: ["loops"], difficulty: 2, milestones: [{ title: "Lire" }, { title: "Boucler" }] }}
          onContinue={vi.fn()}
          onRetry={vi.fn()}
        />
      </I18nProvider>
    );
    expect(screen.getByTestId("completion-screen")).toBeInTheDocument();
    expect(screen.getByText(/Bravo|Well done|أحسنت/)).toBeInTheDocument();
    expect(screen.getByText(/Réflexion|Reflection|تأمل/)).toBeInTheDocument();
    expect(screen.getByText(/Concepts vus/)).toBeInTheDocument();
  });

  it("shows concepts and difficulty", () => {
    render(
      <I18nProvider>
        <CompletionScreen
          exercise={{ title: "Somme", concepts: ["loops", "conditionals"], difficulty: 3, milestones: [] }}
          onContinue={vi.fn()}
        />
      </I18nProvider>
    );
    expect(screen.getByText(/loops, conditionals/)).toBeInTheDocument();
    expect(screen.getByText(/Difficulté 3\/5/)).toBeInTheDocument();
  });

  it("calls onContinue and onRetry", () => {
    const onContinue = vi.fn();
    const onRetry = vi.fn();
    render(
      <I18nProvider>
        <CompletionScreen
          exercise={{ title: "Somme", concepts: [], difficulty: 1, milestones: [] }}
          onContinue={onContinue}
          onRetry={onRetry}
        />
      </I18nProvider>
    );
    fireEvent.click(screen.getByTestId("btn-continue"));
    expect(onContinue).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("btn-retry"));
    expect(onRetry).toHaveBeenCalled();
  });

  it("RTL for Arabic locale", () => {
    localStorage.setItem("locale", "ar");
    render(
      <I18nProvider>
        <CompletionScreen exercise={{ title: "مجموع", concepts: [], difficulty: 2, milestones: [] }} />
      </I18nProvider>
    );
    expect(screen.getByTestId("completion-screen")).toBeInTheDocument();
    expect(screen.getByText(/أحسنت/)).toBeInTheDocument();
  });
});
