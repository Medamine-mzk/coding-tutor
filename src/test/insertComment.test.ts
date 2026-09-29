import { describe, it, expect } from "vitest";
import { hintToCommentBlock, planCommentInsert } from "@/lib/tutor/insertComment";

describe("hintToCommentBlock", () => {
  it("préfixe chaque ligne par # avec en-tête", () => {
    const block = hintToCommentBlock("Quelle donnée faut-il lire ?\nPense à int(input()).", "💡 Indice (niveau 1) :");
    const lines = block.split("\n");
    expect(lines[0]).toBe("# 💡 Indice (niveau 1) :");
    expect(lines[1]).toBe("# Quelle donnée faut-il lire ?");
    expect(lines[2]).toBe("# Pense à int(input()).");
    expect(lines.every((l) => l.startsWith("#"))).toBe(true);
  });

  it("conserve les lignes déjà # (squelette niveau 5) sans double préfixe", () => {
    const block = hintToCommentBlock("# TODO: lire n\nn = int(input())");
    expect(block).toContain("# TODO: lire n");
    expect(block).toContain("# n = int(input())");
    expect(block).not.toContain("# #");
  });

  it("ignore les lignes vides", () => {
    const block = hintToCommentBlock("Ligne un.\n\nLigne deux.");
    expect(block.split("\n").length).toBe(2);
  });

  it("replie les longues lignes (pas de ligne > 90 sauf mot unique)", () => {
    const long = `hintToCommentBlock doit replier les très longues phrases explicatives pour que le commentaire reste lisible dans l'éditeur de code de l'élève sans défilement horizontal`;
    const block = hintToCommentBlock(long);
    for (const l of block.split("\n")) {
      if (!l.includes(" ")) continue;
      expect(l.length).toBeLessThanOrEqual(92); // "# " + 90
    }
  });
});

describe("planCommentInsert", () => {
  const block = "# 💡 Indice :\n# Lire n.";

  it("ligne vide → insertion au début de la ligne, curseur ligne suivante", () => {
    const doc = "a = 1\n\nb = 2";
    const plan = planCommentInsert(doc, 6, block);
    expect(plan.at).toBe(6);
    expect(plan.text).toBe(`${block}\n`);
    const next = doc.slice(0, plan.at) + plan.text + doc.slice(plan.at);
    expect(next).toBe(`a = 1\n${block}\n\nb = 2`);
    expect(next.slice(plan.sel, plan.sel + 5)).toBe("\nb = ");
  });

  it("ligne non vide → fin de ligne intacte, commentaire après + ligne vierge", () => {
    const doc = "a = 1\nb = 2";
    const plan = planCommentInsert(doc, 2, block); // curseur au milieu de "a = 1"
    expect(plan.at).toBe(5);
    const next = doc.slice(0, plan.at) + plan.text + doc.slice(plan.at);
    // Le "\n" d'origine est conservé : une ligne vierge attend le code élève
    expect(next).toBe(`a = 1\n${block}\n\nb = 2`);
    // Curseur sur la ligne vierge (devant le "\n" qui précède "b = 2")
    expect(next.slice(plan.sel)).toBe("\nb = 2");
  });

  it("fin de document sans newline → bloc + curseur après", () => {
    const doc = "a = 1";
    const plan = planCommentInsert(doc, 5, block);
    const next = doc.slice(0, plan.at) + plan.text + doc.slice(plan.at);
    expect(next).toBe(`a = 1\n${block}\n`);
    expect(plan.sel).toBe(next.length);
  });

  it("borne le curseur hors limites", () => {
    const doc = "x = 1";
    const plan = planCommentInsert(doc, 999, block);
    expect(plan.at).toBe(5);
    const neg = planCommentInsert(doc, -3, block);
    expect(neg.at).toBe(5); // ligne "x = 1" non vide → fin de ligne
  });
});
