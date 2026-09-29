import type { Exercise } from "./types";

/**
 * Squelette minimal anti-fuite : titre + commentaire, jamais de code.
 *
 * Le guidage se fait uniquement par les indices (commentHints.ts, niveaux 1→5).
 * Règle unique : si l'énoncé exige explicitement un nom de fonction (`def xxx`),
 * on affiche la signature seule (déjà publique dans l'énoncé) — sans corps,
 * sans TODO d'algorithme, sans pattern I/O.
 */
export function generateSkeleton(exercise: Exercise): string {
  const m = exercise.statement.match(/def\s+([A-Za-z_]\w*)\s*\(/);
  if (m) {
    return `# ${exercise.title}\ndef ${m[1]}(...):\n    # Écris ton code ici\n    pass\n`;
  }
  return `# ${exercise.title}\n# Écris ton code ici\n`;
}
