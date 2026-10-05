import { describe, it, expect } from "vitest";
import { parseCommentedReference, getHintText, getCommentBlock, codeLineExistsInStudentCode } from "@/lib/tutor/commentHints";

const COMMENTED = `# Stocke une valeur lue au clavier, convertie en entier dans n
n = int(input())
# Initialise s à 0 (point de départ pour un compteur ou une somme)
s = 0
# Boucle : i prend les valeurs de 1 à n (borne finale exclue)
for i in range(1, n + 1):
    # Ajoute i à s (mise à jour de la variable)
    s = s + i
# Affiche s
print(s)
`;

describe("parseCommentedReference", () => {
  it("pairs each comment with the next code line, top-down", () => {
    const pairs = parseCommentedReference(COMMENTED);
    expect(pairs.length).toBe(5);
    expect(pairs[0].codeLine).toBe("n = int(input())");
    expect(pairs[0].comments).toEqual(["Stocke une valeur lue au clavier, convertie en entier dans n"]);
    expect(pairs[2].codeLine).toBe("for i in range(1, n + 1):");
    expect(pairs[4].codeLine).toBe("print(s)");
  });

  it("level 1 shows comment only", () => {
    const pairs = parseCommentedReference(COMMENTED);
    expect(getHintText(pairs[0], 1)).toBe("# Stocke une valeur lue au clavier, convertie en entier dans n");
  });

  it("level 5 shows full line without repeating the comment", () => {
    const pairs = parseCommentedReference(COMMENTED);
    const l5 = getHintText(pairs[0], 5);
    expect(l5).toBe("n = int(input())");
    expect(l5).not.toContain("#");
  });

  it("comment is shown only at level 1 (history keeps it)", () => {
    const pairs = parseCommentedReference(COMMENTED);
    for (const p of pairs) {
      if (p.comments.length === 0) continue;
      for (let lvl = 2; lvl <= 5; lvl++) {
        expect(getHintText(p, lvl)).not.toContain("#");
      }
    }
  });

  it("assignment reveals target, then function, then args", () => {
    const pairs = parseCommentedReference(COMMENTED);
    const l2 = getHintText(pairs[0], 2);
    expect(l2).toContain("n =");
    expect(l2).not.toContain("int(");
    const l3 = getHintText(pairs[0], 3);
    expect(l3).toContain("int(");
    expect(l3).not.toContain("input()");
  });

  it("for loop reveals variable, then iterable", () => {
    const pairs = parseCommentedReference(COMMENTED);
    const l2 = getHintText(pairs[2], 2);
    expect(l2).toContain("for");
    expect(l2).not.toContain("range(");
    const l3 = getHintText(pairs[2], 3);
    expect(l3).toContain("range(");
  });

  it("levels 2-5 are monotonic (never reveal less code)", () => {
    const pairs = parseCommentedReference(COMMENTED);
    for (const p of pairs) {
      const stripped = (s: string) => s.replace(/▮/g, "");
      for (let lvl = 2; lvl < 5; lvl++) {
        expect(stripped(getHintText(p, lvl + 1)).length).toBeGreaterThanOrEqual(stripped(getHintText(p, lvl)).length);
      }
    }
  });

  it("getCommentBlock returns # lines only", () => {
    const pairs = parseCommentedReference(COMMENTED);
    expect(getCommentBlock(pairs[1])).toBe("# Initialise s à 0 (point de départ pour un compteur ou une somme)");
  });

  it("handles code without comments (empty levels)", () => {
    const pairs = parseCommentedReference("x = 1\nprint(x)");
    expect(pairs.length).toBe(2);
    expect(pairs[0].comments).toEqual([]);
  });

  it("getHintText clamps out-of-range levels", () => {
    const pairs = parseCommentedReference(COMMENTED);
    expect(getHintText(pairs[0], 0)).toBe(getHintText(pairs[0], 1));
    expect(getHintText(pairs[0], 99)).toBe(getHintText(pairs[0], 5));
  });
});

describe("codeLineExistsInStudentCode (smart skip)", () => {
  it("matches exact lines ignoring whitespace and case", () => {
    expect(codeLineExistsInStudentCode("from numpy import array", "from numpy import array\nn = 1")).toBe(true);
    expect(codeLineExistsInStudentCode("n = int(input())", "  N  =  INT(INPUT())  ")).toBe(true);
    expect(codeLineExistsInStudentCode("print(s)", "print(x)")).toBe(false);
  });

  it("matches import equivalences (same module, other form)", () => {
    expect(codeLineExistsInStudentCode("from numpy import array", "import numpy\nn = 1")).toBe(true);
    expect(codeLineExistsInStudentCode("from numpy import array", "import numpy as np")).toBe(true);
    expect(codeLineExistsInStudentCode("import numpy", "from numpy import *")).toBe(true);
    expect(codeLineExistsInStudentCode("from numpy import array", "import math")).toBe(false);
  });

  it("never matches empty lines or comments", () => {
    expect(codeLineExistsInStudentCode("", "x = 1")).toBe(false);
    expect(codeLineExistsInStudentCode("# comment", "# comment\nx = 1")).toBe(false);
    expect(codeLineExistsInStudentCode("x = 1", "")).toBe(false);
  });
});
