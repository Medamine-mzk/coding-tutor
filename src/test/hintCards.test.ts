import { describe, it, expect } from "vitest";
import {
  getHintCards,
  getHintCardsVersion,
  selectHintCards,
  cardHintForLevel,
  topCardHint,
} from "@/lib/tutor/hintCards";

const VITESSE_STMT =
  "Ecrire un programme qui demande à l’utilisateur de saisir une distance (en kilomètre) et le temps (minute) nécessaire pour la parcourir ; votre programme doit calculer la vitesse (en mètre par seconde).";
const LOGIN_STMT =
  "Ecrire un programme qui demande à l’utilisateur de saisir un login et un mot de passe (deux chaines de caractères). Le programme doit tester si les deux chaines sont égales à « admin » « admin » si c’est le cas on affiche un message de bienvenue sinon on affiche un message incorrecte.";

describe("hintCards — my-scripts/bac-python-hints.fr.json", () => {
  it("charge les cartes FR (21 + vitesse + auth)", () => {
    const cards = getHintCards();
    expect(cards.length).toBe(23);
    expect(getHintCardsVersion()).toBe("1.1.0");
    expect(cards.map((c) => c.id)).toContain("vitesse-conversion");
    expect(cards.map((c) => c.id)).toContain("auth-login");
    for (const c of cards) {
      expect(c.hints.length).toBe(3);
      expect(c.documentation.syntax.length).toBeGreaterThan(0);
    }
  });

  it("vitesse → carte conversion en tête, hints contextualisés", () => {
    const [top] = selectHintCards({ statement: VITESSE_STMT, code: "" }, 1);
    expect(top.id).toBe("vitesse-conversion");
    expect(cardHintForLevel(top, 1)).toMatch(/1 km en mètres|1 minute en secondes/i);
    expect(cardHintForLevel(top, 2)).toMatch(/distance_m.*1000|temps_s.*60/i);
  });

  it("auth → carte login en tête", () => {
    const [top] = selectHintCards({ statement: LOGIN_STMT, code: "" }, 1);
    expect(top.id).toBe("auth-login");
    expect(cardHintForLevel(top, 1)).toMatch(/login|mot de passe|input/i);
  });

  it("erreur IndexError → carte debug-index (boost erreur)", () => {
    const [top] = selectHintCards(
      { statement: "Lire n puis n entiers", code: "print(T[5])", stderr: "IndexError: list index out of range" },
      1
    );
    expect(top.id).toBe("debug-index");
  });

  it("mapping niveaux 0-5 : question → rappel → mini-exemple → doc", () => {
    const { card, text } = topCardHint({ statement: "Lire deux entiers", code: 'print("hello")' }, 0);
    expect(card.id).toBe("io-print");
    expect(text).toBe(card.hints[0]);
    expect(cardHintForLevel(card, 1)).toBe(card.hints[0]);
    expect(cardHintForLevel(card, 2)).toBe(card.hints[1]);
    expect(cardHintForLevel(card, 3)).toBe(card.hints[1]);
    expect(cardHintForLevel(card, 4)).toBe(card.hints[2]);
    const l5 = cardHintForLevel(card, 5);
    expect(l5).toContain(card.documentation.syntax);
    expect(l5).not.toContain("print(sum");
  });

  it("slicing (signaux 1-char) ne domine pas un énoncé simple", () => {
    const [top] = selectHintCards({ statement: "Lire deux entiers", code: 'print("hello")' }, 1);
    expect(top.id).not.toBe("string-slicing");
  });
});
