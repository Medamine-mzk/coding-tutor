/**
 * Mise en forme de l'énoncé pour le panneau élève (blocs riches).
 *
 * Les statements prof (upload/manuel) arrivent en markdown :
 *   # Statement
 *   Lire un entier n ...
 *   ## Examples
 *   - input: 5
 *     output: 15
 *   ## Constraints
 *   - -1000 ≤ n ≤ 1000
 * Le panneau n'affiche que le corps du Statement (sans les `#`), les exemples
 * et contraintes venant des tableaux structurés de l'exercice.
 */

/** Corps du Statement sans marqueurs markdown (`# Statement`, `## ...`). */
export function formatStatementBody(raw: string): string {
  const text = (raw ?? "").replace(/\r/g, "");
  if (!text.trim()) return "";
  if (!/^#+\s/m.test(text)) return text.trim();
  const lines = text.split("\n");
  const out: string[] = [];
  let seenH1 = false;
  for (const line of lines) {
    const t = line.trim();
    if (/^##\s/.test(t)) break; // stop à la première section ##
    const h1 = t.match(/^#\s+(.*)$/);
    if (h1) {
      if (!seenH1) {
        seenH1 = true;
        continue; // enlève "# Statement"
      }
      break; // autre titre # → stop
    }
    out.push(line);
  }
  const body = out.join("\n").trim();
  return body || text.trim();
}
