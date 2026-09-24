import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { LandingClient } from "@/components/LandingClient";

describe("i18n", () => {
  it("renders landing with French when saved locale is fr", () => {
    localStorage.setItem("locale", "fr");
    render(
      <I18nProvider>
        <LandingClient />
      </I18nProvider>
    );
    expect(screen.getByText(/Apprends Python en faisant/i)).toBeInTheDocument();
  });

  it("updates html dir attribute via provider", () => {
    render(
      <I18nProvider>
        <div>probe</div>
      </I18nProvider>
    );
    expect(document.documentElement.lang).toMatch(/fr|en|ar/);
    expect(["ltr", "rtl"]).toContain(document.documentElement.dir);
  });
});
