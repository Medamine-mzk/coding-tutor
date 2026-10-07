import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { LibraryClient } from "@/components/LibraryClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("LibraryClient", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("locale", "fr");
  });

  it("renders 20 exercises and count", () => {
    render(
      <I18nProvider>
        <LibraryClient />
      </I18nProvider>
    );
    expect(screen.getByTestId("library-count").textContent).toMatch(/20 \/ 20/);
    expect(screen.getByTestId("library-grid").children.length).toBe(20);
  });

  it("filters by locale (library is 100% French)", () => {
    render(
      <I18nProvider>
        <LibraryClient />
      </I18nProvider>
    );
    const sel = screen.getByTestId("filter-locale") as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: "fr" } });
    const countText = screen.getByTestId("library-count").textContent ?? "";
    const num = parseInt(countText.split("/")[0].trim(), 10);
    expect(num).toBe(20);
    fireEvent.change(sel, { target: { value: "ar" } });
    const countTextAr = screen.getByTestId("library-count").textContent ?? "";
    expect(countTextAr).toMatch(/^0 \//);
  });

  it("filters by difficulty", () => {
    render(
      <I18nProvider>
        <LibraryClient />
      </I18nProvider>
    );
    fireEvent.change(screen.getByTestId("filter-diff") as HTMLSelectElement, { target: { value: "1" } });
    const count = screen.getByTestId("library-count").textContent ?? "";
    expect(count).toMatch(/\/ 20/);
    // Check that all visible cards have difficulty 1
    const cards = screen.getByTestId("library-grid").children;
    for (const card of Array.from(cards)) {
      expect(card.textContent).toMatch(/1/);
    }
  });

  it("search filters", () => {
    render(
      <I18nProvider>
        <LibraryClient />
      </I18nProvider>
    );
    const input = screen.getByTestId("library-search") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "PGCD" } });
    expect(screen.getByTestId("library-grid").children.length).toBe(1);
    expect(screen.getByText("PGCD de deux nombres")).toBeInTheDocument();
  });

  it("pick stores in localStorage and navigates", async () => {
    render(
      <I18nProvider>
        <LibraryClient />
      </I18nProvider>
    );
    const firstPick = screen.getByTestId("pick-lib_01_hello");
    fireEvent.click(firstPick);
    expect(localStorage.getItem("currentExerciseId")).toBe("lib_01_hello");
    expect(localStorage.getItem("currentExercise")).toContain("Bonjour, monde");
  });

  it("shows no results when filter mismatches", () => {
    render(
      <I18nProvider>
        <LibraryClient />
      </I18nProvider>
    );
    fireEvent.change(screen.getByTestId("library-search") as HTMLInputElement, { target: { value: "zzzz_not_exist" } });
    expect(screen.getByTestId("no-results")).toBeInTheDocument();
  });

  it("RTL for Arabic locale", () => {
    localStorage.setItem("locale", "ar");
    render(
      <I18nProvider>
        <LibraryClient />
      </I18nProvider>
    );
    expect(document.documentElement.dir).toBe("rtl");
    expect(screen.getByText(/المكتبة/)).toBeInTheDocument();
  });
});
