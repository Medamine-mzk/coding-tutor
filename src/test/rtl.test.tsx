import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";

describe("rtl", () => {
  beforeEach(() => localStorage.clear());

  it("sets dir=rtl for Arabic", () => {
    localStorage.setItem("locale", "ar");
    render(
      <I18nProvider>
        <div>probe</div>
      </I18nProvider>
    );
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.lang).toBe("ar");
  });

  it("sets dir=ltr for French", () => {
    localStorage.setItem("locale", "fr");
    render(
      <I18nProvider>
        <div>probe</div>
      </I18nProvider>
    );
    expect(document.documentElement.dir).toBe("ltr");
    expect(document.documentElement.lang).toBe("fr");
  });
});
