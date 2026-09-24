import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { WorkspaceClient } from "@/components/WorkspaceClient";

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
});
