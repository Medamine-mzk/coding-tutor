import type { Exercise } from "./types";

export function generateSkeleton(exercise: Exercise): string {
  const stmt = exercise.statement.toLowerCase();
  const isVitesse = stmt.includes("vitesse") && (stmt.includes("distance") || stmt.includes("kilom"));

  if (isVitesse) {
    // Minimal skeleton for vitesse — prompts, conversion, division by zero guard
    return `# ${exercise.title}
# ${exercise.statement.slice(0, 80)}
distance_km = float(input("distance (km) : "))
temps_min = float(input("temps (minutes) : "))

# TODO: convertir les unités
# distance_m = distance_km * 1000
# temps_s = temps_min * 60

# TODO: gérer le cas temps = 0
# TODO: calculer la vitesse (m/s) = distance_m / temps_s

# TODO: afficher le résultat
`;
  }

  if (exercise.concepts.includes("recursion")) {
    return `# ${exercise.title}\ndef solve(n):\n    # TODO: cas de base\n    # TODO: appel récursif\n    pass\n\nn = int(input())\nprint(solve(n))\n`;
  }

  if (exercise.concepts.includes("functions")) {
    return `# ${exercise.title}\ndef solve(a, b):\n    # TODO: implémenter la fonction\n    pass\n\na = int(input())\nb = int(input())\nprint(solve(a, b))\n`;
  }

  if (exercise.concepts.includes("lists")) {
    return `# ${exercise.title}\nn = int(input())\n# TODO: lire la liste\n# TODO: traiter avec une boucle\nprint(n)\n`;
  }

  // Generic minimal skeleton — includes input/print so Lire/Afficher milestones are considered done, core logic still TODO
  return `# ${exercise.title}\nn = int(input())\n# TODO: traiter les données\nprint(n)\n`;
}
