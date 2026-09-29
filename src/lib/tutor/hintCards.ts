/**
 * Sélection d'indices BAC depuis `my-scripts/bac-python-hints.fr.json` (Q2, Q3).
 *
 * Ce module REMPLACE les hints en dur de `prompt.ts` (byLevel/auth/vitesse).
 * Source unique FR (curriculum BAC TN) : chaque carte porte 3 niveaux
 * (question socratique / rappel syntaxe / mini-exemple) + documentation.
 *
 * Mapping niveaux app (0-5) vers carte (3 hints + doc) :
 * - 0,1 → hints[0] (question socratique)
 * - 2,3 → hints[1] (rappel + syntaxe)
 * - 4   → hints[2] (mini-exemple indépendant)
 * - 5   → documentation.syntax + note (squelette, jamais la solution)
 */

import cardsData from "../../../my-scripts/bac-python-hints.fr.json";
import type { HintLevel } from "./types";

export type HintCard = {
  id: string;
  concept: string;
  title: string;
  tags: string[];
  priority: number;
  detect: { referenceAny: string[]; studentAny: string[]; errorsAny: string[] };
  hints: [string, string, string];
  documentation: { syntax: string; note: string };
};

type CardsFile = {
  version: string;
  locale: string;
  policy: { maxHintLevel: number; neverGiveFullSolution: boolean };
  cards: HintCard[];
};

const data = cardsData as unknown as CardsFile;

export function getHintCards(): HintCard[] {
  return data.cards;
}

export function getHintCardsVersion(): string {
  return data.version;
}

export type CardSelectionInput = {
  /** Énoncé / statement (proxy de la référence côté fallback, où la réf est inconnue). */
  statement: string;
  /** Code élève actuel. */
  code: string;
  /** stderr de la dernière exécution ("" si aucune). */
  stderr?: string;
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Correspondance sur frontière de mot à gauche : évite que `int(` matche
 * dans `print(`, ou `in` dans `print`. Les signaux 1-char (slicing) restent
 * en inclusion simple (poids faible).
 */
function includesToken(hay: string, needle: string): boolean {
  if (!needle) return false;
  if (needle.length < 2) return hay.includes(needle);
  return new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(needle)}`, "i").test(hay);
}

function countHits(needles: string[], hay: string, fullWeight: number, shortWeight: number): number {
  let score = 0;
  for (const n of needles) {
    if (!n) continue;
    if (includesToken(hay, n)) score += n.length >= 2 ? fullWeight : shortWeight;
  }
  return score;
}

/**
 * Trie les cartes par pertinence : erreurs d'abord (boost), puis correspondance
 * énoncé/code, puis priorité de la carte. Toujours non-vide.
 */
export function selectHintCards(input: CardSelectionInput, limit = 3): HintCard[] {
  const statement = (input.statement ?? "").toLowerCase();
  const code = (input.code ?? "").toLowerCase();
  const stderr = (input.stderr ?? "").toLowerCase();
  const proxy = `${statement}\n${code}`;

  const scored = data.cards.map((card) => {
    let score = card.priority / 10;
    // Tags dans l'énoncé (mots de 3+ lettres, frontière gauche : "entier"
    // matche "entiers" mais "int" ne matche pas "print").
    for (const tag of card.tags) {
      if (tag.length >= 3 && includesToken(statement, tag.toLowerCase())) score += 5;
    }
    // Signaux de la carte dans énoncé+code (entries 1-char comptent peu : cas slicing).
    score += countHits(
      card.detect.referenceAny.map((s) => s.toLowerCase()),
      proxy,
      20,
      2
    );
    score += countHits(
      card.detect.studentAny.map((s) => s.toLowerCase()),
      code,
      8,
      1
    );
    // Erreurs : boost fort, la carte d'erreur gagne toujours.
    if (stderr && card.detect.errorsAny.length > 0) {
      score += countHits(
        card.detect.errorsAny.map((s) => s.toLowerCase()),
        stderr,
        100,
        10
      );
    }
    return { card, score };
  });

  scored.sort((a, b) => b.score - a.score || b.card.priority - a.card.priority);
  return scored.slice(0, Math.max(1, limit)).map((s) => s.card);
}

/** Texte d'une carte pour un niveau 0-5 (jamais de solution complète). */
export function cardHintForLevel(card: HintCard, level: HintLevel): string {
  if (level <= 1) return card.hints[0];
  if (level <= 3) return card.hints[1];
  if (level === 4) return card.hints[2];
  // Niveau 5 = squelette à compléter : la syntaxe doc en lignes TODO commentées
  // (structure + blancs, jamais du code actif à copier-coller).
  const todo = card.documentation.syntax
    .split("\n")
    .map((l) => `# TODO: ${l}`)
    .join("\n");
  return `# Squelette — ${card.title} (à compléter)\n${todo}\n# ${card.documentation.note}`;
}

/** Raccourci : meilleure carte + texte pour le niveau demandé. */
export function topCardHint(input: CardSelectionInput, level: HintLevel): { card: HintCard; text: string } {
  const [card] = selectHintCards(input, 1);
  return { card, text: cardHintForLevel(card, level) };
}
