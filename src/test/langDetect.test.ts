import { describe, it, expect } from "vitest";
import { looksEnglish, looksFrench, hasArabic, responseMatchesLocale, stripCodeForLangDetect } from "@/lib/tutor/langDetect";

const REPORTED_EN_HINT =
  "Before writing code, let's clarify the problem. In your own words, what are the two base cases for `fib(n)`, and what is the recursive step (how do you express `fib(n)` using smaller values of `fib`)?";

describe("langDetect", () => {
  it("flags the reported English hint as English, not French", () => {
    expect(looksEnglish(REPORTED_EN_HINT)).toBe(true);
    expect(looksFrench(REPORTED_EN_HINT)).toBe(false);
    expect(responseMatchesLocale(REPORTED_EN_HINT, "fr")).toBe(false);
  });

  it("accepts French card hints for fr", () => {
    const fr = "Quelle donnée faut-il obtenir avant de commencer le traitement ? Pense à convertir avec int(input()).";
    expect(responseMatchesLocale(fr, "fr")).toBe(true);
    expect(looksEnglish(fr)).toBe(false);
  });

  it("ignores Python code blocks when detecting (identifiers are English)", () => {
    const frWithCode =
      "Utilise input() pour lire.\n```python\nfor i in range(0, n):\n    print(T[i])\n```\nQue vaut n au départ ?";
    expect(responseMatchesLocale(frWithCode, "fr")).toBe(true);
    expect(stripCodeForLangDetect(frWithCode)).not.toContain("range");
  });

  it("detects Arabic presence for ar", () => {
    expect(hasArabic("اشرح الخطأ")).toBe(true);
    expect(hasArabic("Explain the error")).toBe(false);
    expect(responseMatchesLocale("اشرح الخطأ", "ar")).toBe(true);
    expect(responseMatchesLocale("Explain the error", "ar")).toBe(false);
  });

  it("accepts English prose for en, rejects Arabic/French-marked text", () => {
    expect(responseMatchesLocale("What happened on your last run? Check the loop.", "en")).toBe(true);
    expect(responseMatchesLocale("اشرح الخطأ", "en")).toBe(false);
  });
});
