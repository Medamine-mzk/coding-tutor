import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import Home from "@/app/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

describe("landing page", () => {
  it("renders CTA and paste area", () => {
    render(
      <I18nProvider>
        <Home />
      </I18nProvider>
    );
    expect(screen.getByPlaceholderText(/Colle ici|Paste your|الصق نص/)).toBeInTheDocument();
    expect(screen.getByText(/Continuer avec Python|Continue with Python|المتابعة/)).toBeInTheDocument();
  });
});
