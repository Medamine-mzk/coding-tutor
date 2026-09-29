/**
 * Port TypeScript de `my-scripts/add_comments.py` (Q1).
 *
 * Ajoute un commentaire explicatif FR AU-DESSUS de chaque instruction d'un
 * code Python BAC. Idempotent : relancer ne duplique rien (une ligne déjà
 * précédée d'un commentaire est laissée telle quelle).
 *
 * Différences assumées vs la version Python (qui utilise `ast`) :
 * - analyse ligne par ligne (Node n'a pas d'équivalent `ast` Python) ;
 * - couvre le sous-ensemble BAC (import/def/return/assign/if/for-range/while/
 *   print/input/tri except) ; les instructions inconnues ne sont pas commentées ;
 * - instruction multi-lignes via parenthèses : commentaire sur la 1re ligne
 *   seulement (suivi de profondeur de parenthèses, chaînes ignorées) ;
 * - `break`/`continue`/`**` sont commentés comme INTERDITS BAC (avertissement,
 *   pas une suggestion).
 *
 * Usage server-side uniquement (aperçu enseignant) — jamais envoyé à l'élève.
 */

const CONVERSIONS: Record<string, string> = {
  int: "entier",
  float: "réel",
  str: "chaîne",
  bool: "booléen",
};

const BINOP_NAMES: Array<[string, string]> = [
  ["//", "le quotient entier"],
  ["**", "la puissance"],
  ["+", "la somme"],
  ["-", "la différence"],
  ["*", "le produit"],
  ["/", "la division réelle"],
  ["%", "le reste de la division"],
];

const AUG_VERBS: Record<string, string> = {
  "+=": "Ajoute {v} à {t}",
  "-=": "Retire {v} de {t}",
  "*=": "Multiplie {t} par {v}",
  "/=": "Divise {t} par {v}",
  "//=": "Remplace {t} par son quotient entier par {v}",
  "%=": "Remplace {t} par son reste dans la division par {v}",
};

export function humanizeCondition(cond: string): string {
  let t = cond.replace(/(\w+)\s*%\s*(\w+)\s*==\s*0/, "$1 est divisible par $2");
  const reps: Array<[string, string]> = [
    [" == ", " est égal à "],
    [" != ", " est différent de "],
    [" >= ", " est supérieur ou égal à "],
    [" <= ", " est inférieur ou égal à "],
    [" > ", " est supérieur à "],
    [" < ", " est inférieur à "],
    [" and ", " ET "],
    [" or ", " OU "],
  ];
  for (const [old, next] of reps) t = t.split(old).join(next);
  t = t.replace(/\bnot\s+/g, "NON ");
  return t;
}

function stripStrings(code: string): string {
  return code.replace(/(['"])(?:\\.|(?!\1).)*\1/g, '""');
}

function countParens(line: string): number {
  const s = stripStrings(line);
  let d = 0;
  for (const ch of s) {
    if (ch === "(") d++;
    else if (ch === ")") d--;
  }
  return d;
}

function binopName(expr: string): { name: string; text: string } | null {
  const s = stripStrings(expr);
  for (const [op, name] of BINOP_NAMES) {
    const idx = s.indexOf(op);
    if (idx !== -1) return { name, text: `${name} : ${expr}` };
  }
  return null;
}

export function valueDesc(v: string): string {
  const e = v.trim();
  let m = e.match(/^(int|float|str|bool)\(\s*input\(.*?\)\s*\)$/);
  if (m) return `une valeur lue au clavier, convertie en ${CONVERSIONS[m[1]]}`;
  if (/^input\(.*\)$/.test(e)) return "une valeur lue au clavier (texte)";
  m = e.match(/^(int|float|str|bool)\((.+)\)$/);
  if (m) return `la conversion de ${m[2].trim()} en ${CONVERSIONS[m[1]]}`;
  m = e.match(/^randint\((.+?),\s*(.+)\)$/);
  if (m) return `un entier aléatoire entre ${m[1].trim()} et ${m[2].trim()} (bornes incluses)`;
  m = e.match(/^sqrt\((.+)\)$/);
  if (m) return `la racine carrée de ${m[1].trim()}`;
  m = e.match(/^round\((.+?),\s*(.+)\)$/);
  if (m) return `${m[1].trim()} arrondi à ${m[2].trim()} décimale(s)`;
  m = e.match(/^round\((.+)\)$/);
  if (m) return `${m[1].trim()} arrondi à l'entier le plus proche`;
  m = e.match(/^len\((.+)\)$/);
  if (m) return `la longueur de ${m[1].trim()}`;
  m = e.match(/^array\((.+)\)$/);
  if (m) {
    const inner = m[1].trim();
    const am = inner.match(/^\[(.+)\]\s*\*\s*(.+)$/);
    if (am) return `un tableau de ${am[2].trim()} case(s) initialisée(s) à ${am[1].trim()}`;
    return `un tableau initialisé avec ${inner}`;
  }
  m = e.match(/^(.+)\.upper\(\)$/);
  if (m) return `${m[1].trim()} en majuscules`;
  m = e.match(/^(.+)\.find\((.+)\)$/);
  if (m) return `la première position de ${m[2].trim()} dans ${m[1].trim()} (-1 si absent)`;
  m = e.match(/^open\((.+)\)$/);
  if (m) return `le fichier ${m[1].trim()} ouvert`;
  if (/^(['"].*['"]|[\d.]+|True|False|None)$/.test(e)) return `la valeur ${e}`;
  m = e.match(/^(.+?)\[(.+):(.*)\]$/);
  if (m) {
    const lo = m[2].trim() === "" ? "le début" : m[2].trim();
    const hi = m[3].trim() === "" ? "la fin" : m[3].trim();
    return `la partie de ${m[1].trim()} entre ${lo} et ${hi} (exclu)`;
  }
  m = e.match(/^(.+?)\[(.+)\]$/);
  if (m) return `le contenu de la case ${e}`;
  const b = binopName(e);
  if (b) return b.text;
  return `le résultat de ${e}`;
}

function describeFor(target: string, argsRaw: string): string {
  const args = argsRaw.split(",").map((a) => a.trim()).filter((a) => a !== "");
  if (args.length === 1) return `Boucle : ${target} prend les valeurs de 0 à ${args[0]}-1`;
  if (args.length === 2) return `Boucle : ${target} prend les valeurs de ${args[0]} à ${args[1]}-1 (borne finale exclue)`;
  if (args.length >= 3) return `Boucle : ${target} va de ${args[0]} jusqu'à ${args[1]} (exclu) avec un pas de ${args[2]}`;
  return `Parcourt chaque élément avec la variable ${target}`;
}

/** Commentaire pour UNE ligne (sans indentation). `null` = ne pas commenter. */
export function describeLine(trimmed: string): string | null {
  let m: RegExpMatchArray | null;

  if (/^"""/.test(trimmed) || /^'''/.test(trimmed)) return null; // docstring
  m = trimmed.match(/^import\s+(.+)$/);
  if (m) return `Importe le(s) module(s) : ${m[1].trim()}`;
  m = trimmed.match(/^from\s+(\S+)\s+import\s+(.+)$/);
  if (m) return `Importe ${m[2].trim()} depuis le module ${m[1].trim()}`;
  m = trimmed.match(/^def\s+(\w+)\s*\(([^)]*)\)\s*:/);
  if (m) {
    const params = m[2].split(",").map((p) => p.trim()).filter(Boolean);
    if (params.length) return `Définit la fonction ${m[1]} qui reçoit : ${params.join(", ")}`;
    return `Définit la fonction ${m[1]} (sans paramètre)`;
  }
  m = trimmed.match(/^return\s*(.*)$/);
  if (m) {
    if (m[1].trim()) return `Renvoie ${m[1].trim()} comme résultat de la fonction`;
    return "Termine la fonction (sans valeur)";
  }
  m = trimmed.match(/^if\s+(.+):$/);
  if (m) return `Teste si ${humanizeCondition(m[1].trim())} ; si oui, exécute le bloc indenté`;
  m = trimmed.match(/^elif\s+(.+):$/);
  if (m) return `Sinon, teste si ${humanizeCondition(m[1].trim())} ; si oui, exécute le bloc indenté`;
  if (/^else\s*:$/.test(trimmed)) return "Sinon (aucune condition précédente n'est vraie), exécute ce bloc";
  m = trimmed.match(/^for\s+(\w+)\s+in\s+range\((.*)\)\s*:$/);
  if (m) return describeFor(m[1], m[2]);
  m = trimmed.match(/^for\s+(\w+)\s+in\s+(.+):$/);
  if (m) return `Parcourt chaque élément de ${m[2].trim()} avec la variable ${m[1]}`;
  m = trimmed.match(/^while\s+(.+):$/);
  if (m) return `Répète le bloc tant que ${humanizeCondition(m[1].trim())}`;
  if (/^break$/.test(trimmed)) return "Sort immédiatement de la boucle (INTERDIT BAC — à éviter)";
  if (/^continue$/.test(trimmed)) return "Passe à l'itération suivante (INTERDIT BAC — à éviter)";
  if (/^pass$/.test(trimmed)) return "Ne fait rien (bloc vide volontaire)";
  if (/^try\s*:$/.test(trimmed)) return "Essaie d'exécuter le bloc ; les erreurs sont gérées plus bas";
  m = trimmed.match(/^except(?:\s+(.+))?:$/);
  if (m) return m[1] ? `Si une erreur ${m[1].trim()} se produit, exécute ce bloc` : "Si une erreur se produit, exécute ce bloc";
  if (/^finally\s*:$/.test(trimmed)) return "Dans tous les cas (erreur ou non), exécute ce bloc";
  m = trimmed.match(/^with\s+(.+):$/);
  if (m) return `Utilise ${m[1].trim()} dans un bloc (fermeture automatique)`;
  if (/^raise\b/.test(trimmed)) return "Déclenche une erreur";
  m = trimmed.match(/^assert\s+(.+)$/);
  if (m) return `Vérifie que ${humanizeCondition(m[1].trim())} est vrai (sinon erreur)`;
  m = trimmed.match(/^del\s+(.+)$/);
  if (m) return `Supprime : ${m[1].trim()}`;
  m = trimmed.match(/^(global|nonlocal)\s+(.+)$/);
  if (m) return `Déclare que ${m[2].trim()} désigne une variable externe à la fonction`;
  m = trimmed.match(/^print\((.*)\)$/);
  if (m) {
    const args = m[1].trim();
    if (!args) return "Affiche une ligne vide";
    if (/^(['"]).*\1$/.test(args)) return `Affiche le message ${args}`;
    return `Affiche ${args}`;
  }
  // Affectation multiple : a, b = ...
  m = trimmed.match(/^([^=]+)=([^=].*)$/);
  if (m && m[1].includes(",")) return `Affecte simultanément les valeurs à ${m[1].trim()}`;
  m = trimmed.match(/^(\w+)\s*(\+=|-=|\*=|\/=|\/\/=|%=)\s*(.+)$/);
  if (m) {
    const verb = AUG_VERBS[m[2]] ?? "Met à jour {t} avec {v}";
    return verb.replace("{t}", m[1]).replace("{v}", m[3].trim());
  }
  m = trimmed.match(/^(.+\[.+?\])\s*=\s*(.+)$/);
  if (m) return `Range ${valueDesc(m[2])} dans la case ${m[1].trim()}`;
  m = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
  if (m) {
    const t = m[1];
    const v = m[2].trim();
    const acc = v.match(/^(\w+)\s*(\+|-|\*|\/|%| \/\/ )\s*(.+)$/);
    if (acc && acc[1] === t) {
      const op = acc[2].trim();
      const verb = AUG_VERBS[op === "/" ? "/=" : op === "*" ? "*=" : op === "+" ? "+=" : op === "-" ? "-=" : op === "%" ? "%=" : "//="] ?? "Met à jour {t} avec {v}";
      return `${verb.replace("{t}", t).replace("{v}", acc[3].trim())} (mise à jour de la variable)`;
    }
    if ((v === "0" || v === "1") && !/True|False/.test(v)) {
      const role = v === "0" ? "un compteur ou une somme" : "un produit ou un compteur";
      return `Initialise ${t} à ${v} (point de départ pour ${role})`;
    }
    return `Stocke ${valueDesc(v)} dans ${t}`;
  }
  m = trimmed.match(/^([\w.]+)\((.*)\)$/);
  if (m) {
    if (m[1] === "input" || m[1].endsWith(".input")) return "Attend que l'utilisateur appuie sur Entrée";
    if (m[1] === "close" || m[1].endsWith(".close")) return "Ferme le fichier";
    return `Appelle ${trimmed}`;
  }
  return null;
}

export function addComments(source: string): string {
  const lines = source.split("\n");
  // Comme `str.splitlines()` Python : pas d'élément vide final parasite
  // (sinon chaque passage ajouterait une ligne vide → non idempotent).
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const out: string[] = [];
  let parenDepth = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      out.push(line);
      continue;
    }
    if (parenDepth > 0) {
      // Suite d'une instruction multi-lignes : pas de commentaire ici.
      out.push(line);
      parenDepth += countParens(line);
      if (parenDepth < 0) parenDepth = 0;
      continue;
    }
    const comment = describeLine(trimmed);
    if (comment) {
      const prev = out.length ? out[out.length - 1].trim() : "";
      if (!prev.startsWith("#")) {
        const indent = line.slice(0, line.length - line.trimStart().length);
        out.push(`${indent}# ${comment}`);
      }
    }
    out.push(line);
    parenDepth += countParens(line);
    if (parenDepth < 0) parenDepth = 0;
  }
  return `${out.join("\n")}\n`;
}
