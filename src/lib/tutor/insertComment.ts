/**
 * Insertion d'indices en commentaires dans l'éditeur (hints → `# ...`).
 *
 * Principe : chaque indice devient un bloc de commentaires à sa place exacte
 * (position du curseur), et le curseur atterrit sur la ligne suivante vide —
 * l'élève écrit son code juste en dessous. Un commentaire ne casse jamais le
 * code Python, où qu'il soit inséré.
 */

const MAX_COMMENT_WIDTH = 90;

/** Découpe gourmande une ligne en morceaux ≤ largeur (sans couper les mots). */
function wrapLine(line: string, width: number): string[] {
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if (`${cur} ${w}`.length <= width) cur = `${cur} ${w}`;
    else {
      out.push(cur);
      cur = w;
    }
  }
  if (cur) out.push(cur);
  // Mot unique trop long : on le garde tel quel (URLs, code).
  return out;
}

/**
 * Convertit un texte d'indice en bloc de commentaires Python.
 * - `header` optionnel en première ligne (ex. `# 💡 Indice (niveau 2) :`).
 * - Les lignes déjà `#` sont conservées (squelette niveau 5).
 * - Les lignes vides sont ignorées, les longues sont repliées.
 */
export function hintToCommentBlock(text: string, header?: string): string {
  const out: string[] = [];
  if (header) out.push(`# ${header}`);
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      out.push(...wrapLine(line, MAX_COMMENT_WIDTH).map((w, i) => (i === 0 ? w : `# ${w.replace(/^#\s?/, "")}`)));
    } else {
      out.push(...wrapLine(line, MAX_COMMENT_WIDTH).map((w) => `# ${w}`));
    }
  }
  return out.join("\n");
}

export type CommentInsertion = {
  /** Position d'insertion dans le document. */
  at: number;
  /** Texte à insérer (se termine toujours par `\n`). */
  text: string;
  /** Position du curseur après insertion (début de la ligne suivante). */
  sel: number;
};

/**
 * Calcule où insérer le bloc : à la place exacte du curseur, sans casser de ligne.
 * - Ligne vide → insertion au début de la ligne.
 * - Ligne non vide → insertion en fin de ligne (la ligne existante reste intacte).
 * Le curseur final est au début de la ligne suivante (prête pour le code élève).
 */
export function planCommentInsert(doc: string, cursor: number, block: string): CommentInsertion {
  const safe = Math.max(0, Math.min(cursor, doc.length));
  let lineEnd = doc.indexOf("\n", safe);
  if (lineEnd === -1) lineEnd = doc.length;
  const lineStart = doc.lastIndexOf("\n", safe - 1) + 1;
  const lineText = doc.slice(lineStart, lineEnd);
  if (lineText.trim() === "") {
    const text = `${block}\n`;
    return { at: lineStart, text, sel: lineStart + text.length };
  }
  const text = `\n${block}\n`;
  return { at: lineEnd, text, sel: lineEnd + text.length };
}
