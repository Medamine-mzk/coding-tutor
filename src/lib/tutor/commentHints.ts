/**
 * Moteur de hints basé sur les commentaires de la référence.
 *
 * Chaque paire (commentaire, code) devient un indice progressif à 5 niveaux :
 *   1 — commentaire FR uniquement
 *   2 — cible seule (LHS de =, variable de for)
 *   3 — + opérateur / fonction
 *   4 — + arguments partiels
 *   5 — ligne complète
 * Le commentaire n'est montré qu'au niveau 1 (l'historique le conserve) ;
 * les niveaux 2-5 ne contiennent que le code progressivement révélé.
 *
 * Le masquage utilise ▮ pour les parties cachées. Chaque ligne est traitée
 * séparément (pas de regroupement de blocs).
 */

export type CommentHint = {
  /** Lignes de commentaire FR (sans #) */
  comments: string[];
  /** Ligne de code Python */
  codeLine: string;
  /** Niveaux 1-5 (chaque niveau inclut le précédent) */
  levels: [string, string, string, string, string];
};

type ParsedLine = {
  kind: "assign" | "augassign" | "for" | "while" | "if" | "elif" | "else" | "def" | "return" | "print" | "import" | "from" | "expr" | "try" | "except" | "with" | "pass" | "break" | "continue";
  target?: string;
  operator?: string;
  func?: string;
  args?: string;
  condition?: string;
  full: string;
};

function parseLine(line: string): ParsedLine {
  const t = line.trim();
  const full = t;

  let m: RegExpMatchArray | null;

  // for var in iterable:
  m = t.match(/^for\s+(\w+)\s+in\s+(.+):$/);
  if (m) return { kind: "for", target: m[1], args: m[2], full };

  // while condition:
  m = t.match(/^while\s+(.+):$/);
  if (m) return { kind: "while", condition: m[1], full };

  // if/elif/else
  m = t.match(/^if\s+(.+):$/);
  if (m) return { kind: "if", condition: m[1], full };
  m = t.match(/^elif\s+(.+):$/);
  if (m) return { kind: "elif", condition: m[1], full };
  if (/^else\s*:$/.test(t)) return { kind: "else", full };

  // def name(params):
  m = t.match(/^def\s+(\w+)\s*\(([^)]*)\)\s*:/);
  if (m) return { kind: "def", target: m[1], args: m[2], full };

  // return expr
  m = t.match(/^return\s*(.*)$/);
  if (m) return { kind: "return", args: m[1] || undefined, full };

  // import / from
  if (/^import\s+/.test(t)) return { kind: "import", full };
  if (/^from\s+/.test(t)) return { kind: "from", full };

  // try/except/finally
  if (/^try\s*:$/.test(t)) return { kind: "try", full };
  m = t.match(/^except(?:\s+(.+))?:$/);
  if (m) return { kind: "except", condition: m[1], full };
  if (/^finally\s*:$/.test(t)) return { kind: "except", full };

  // with
  m = t.match(/^with\s+(.+):$/);
  if (m) return { kind: "with", args: m[1], full };

  // pass/break/continue
  if (/^pass$/.test(t)) return { kind: "pass", full };
  if (/^break$/.test(t)) return { kind: "break", full };
  if (/^continue$/.test(t)) return { kind: "continue", full };

  // augmented assignment: target += expr
  m = t.match(/^(\w+)\s*(\+=|-=|\*=|\/=|\/\/=|%=)\s*(.+)$/);
  if (m) return { kind: "augassign", target: m[1], operator: m[2], args: m[3], full };

  // simple assignment: target = expr
  m = t.match(/^(\w+)\s*=\s*(.+)$/);
  if (m) return { kind: "assign", target: m[1], args: m[2], full };

  // function call: func(args)
  m = t.match(/^(\w+)\((.*)\)$/);
  if (m) return { kind: "print", func: m[1], args: m[2], full };

  // expression statement
  return { kind: "expr", full };
}

function mask(s: string): string {
  return "▮".repeat(Math.max(3, Math.min(s.length, 12)));
}

function reveal(parsed: ParsedLine, level: number): string {
  if (level >= 5) return parsed.full;

  switch (parsed.kind) {
    case "assign": {
      const t = parsed.target ?? "▮";
      const rhs = parsed.args ?? "";
      if (level <= 1) return "";
      if (level === 2) return `${t} = ${mask(rhs)}`;
      if (level === 3) {
        // Show function name if RHS is a call
        const callMatch = rhs.match(/^(\w+)\((.*)\)$/);
        if (callMatch) return `${t} = ${callMatch[1]}(${mask(callMatch[2])})`;
        // Show first operand of binary expression
        const binMatch = rhs.match(/^(\w+)\s*(\+|-|\*|\/|%|\/\/)\s*(.+)$/);
        if (binMatch) return `${t} = ${binMatch[1]} ${mask(binMatch[2] + " " + binMatch[3])}`;
        return `${t} = ${mask(rhs)}`;
      }
      if (level === 4) {
        const callMatch = rhs.match(/^(\w+)\((.*)\)$/);
        if (callMatch) {
          const inner = callMatch[2];
          if (inner.length <= 2) return `${t} = ${callMatch[1]}(${inner})`;
          return `${t} = ${callMatch[1]}(${inner.slice(0, Math.ceil(inner.length / 2))}▮)`;
        }
        const binMatch = rhs.match(/^(\w+)\s*(\+|-|\*|\/|%|\/\/)\s*(.+)$/);
        if (binMatch) return `${t} = ${binMatch[1]} ${binMatch[2]} ${mask(binMatch[3])}`;
        return `${t} = ${rhs.slice(0, Math.ceil(rhs.length / 2))}▮`;
      }
      return parsed.full;
    }

    case "augassign": {
      const t = parsed.target ?? "▮";
      const op = parsed.operator ?? "+=";
      const rhs = parsed.args ?? "";
      if (level <= 1) return "";
      if (level === 2) return `${t} ${op} ${mask(rhs)}`;
      if (level === 3) return `${t} ${op} ${rhs.slice(0, Math.ceil(rhs.length / 2))}▮`;
      return parsed.full;
    }

    case "for": {
      const v = parsed.target ?? "▮";
      const it = parsed.args ?? "";
      if (level <= 1) return "";
      if (level === 2) return `for ${mask(v)} in ${mask(it)}:`;
      if (level === 3) {
        const callMatch = it.match(/^(\w+)\((.*)\)$/);
        if (callMatch) return `for ${v} in ${callMatch[1]}(${mask(callMatch[2])})`;
        return `for ${v} in ${mask(it)}:`;
      }
      if (level === 4) {
        const callMatch = it.match(/^(\w+)\((.*)\)$/);
        if (callMatch) {
          const inner = callMatch[2];
          if (inner.length <= 2) return `for ${v} in ${callMatch[1]}(${inner}):`;
          return `for ${v} in ${callMatch[1]}(${inner.slice(0, Math.ceil(inner.length / 2))}▮):`;
        }
        return `for ${v} in ${it}:`;
      }
      return parsed.full;
    }

    case "while": {
      const cond = parsed.condition ?? "";
      if (level <= 1) return "";
      if (level === 2) return `while ${mask(cond)}:`;
      if (level === 3) return `while ${cond.slice(0, Math.ceil(cond.length / 2))}▮:`;
      return parsed.full;
    }

    case "if":
    case "elif": {
      const cond = parsed.condition ?? "";
      if (level <= 1) return "";
      if (level === 2) return `${parsed.kind} ${mask(cond)}:`;
      if (level === 3) return `${parsed.kind} ${cond.slice(0, Math.ceil(cond.length / 2))}▮:`;
      return parsed.full;
    }

    case "def": {
      const name = parsed.target ?? "▮";
      const params = parsed.args ?? "";
      if (level <= 1) return "";
      if (level === 2) return `def ${mask(name)}(${mask(params)}):`;
      if (level === 3) return `def ${name}(${mask(params)}):`;
      if (level === 4) return `def ${name}(${params}):`;
      return parsed.full;
    }

    case "return": {
      const val = parsed.args ?? "";
      if (level <= 1) return "";
      if (level === 2) return `return ${mask(val)}`;
      if (level === 3) return `return ${val.slice(0, Math.ceil(val.length / 2))}▮`;
      return parsed.full;
    }

    case "print": {
      const f = parsed.func ?? "▮";
      const a = parsed.args ?? "";
      if (level <= 1) return "";
      if (level === 2) return `${mask(f)}(${mask(a)})`;
      if (level === 3) return `${f}(${mask(a)})`;
      if (level === 4) {
        if (a.length <= 2) return `${f}(${a})`;
        return `${f}(${a.slice(0, Math.ceil(a.length / 2))}▮)`;
      }
      return parsed.full;
    }

    case "expr": {
      if (level <= 1) return "";
      if (level === 2) return mask(parsed.full);
      if (level === 3) return `${parsed.full.slice(0, Math.ceil(parsed.full.length / 2))}▮`;
      return parsed.full;
    }

    default:
      // import, from, try, except, with, pass, break, continue, else
      if (level <= 1) return "";
      if (level === 2) return mask(parsed.full);
      return parsed.full;
  }
}

/**
 * Parse a commented reference solution into progressive hint pairs.
 * Groups consecutive comment lines, then the next non-comment line is the code.
 */
export function parseCommentedReference(commented: string): CommentHint[] {
  const lines = commented.split("\n");
  const hints: CommentHint[] = [];
  let pendingComments: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      if (pendingComments.length > 0 && hints.length > 0) {
        // Blank line after comments: flush as a hint with no code (comment-only)
        const last = hints[hints.length - 1];
        last.comments.push(...pendingComments);
        pendingComments = [];
      }
      continue;
    }
    if (trimmed.startsWith("#")) {
      pendingComments.push(trimmed.replace(/^#\s?/, ""));
      continue;
    }
    // Code line
    const parsed = parseLine(trimmed);
    const levels: [string, string, string, string, string] = ["", "", "", "", ""];
    for (let lvl = 1; lvl <= 5; lvl++) {
      const code = reveal(parsed, lvl);
      const commentBlock = pendingComments.map((c) => `# ${c}`).join("\n");
      levels[lvl - 1] = lvl === 1 ? commentBlock : code;
    }
    hints.push({ comments: pendingComments, codeLine: trimmed, levels });
    pendingComments = [];
  }

  // Trailing comments without code
  if (pendingComments.length > 0) {
    const commentBlock = pendingComments.map((c) => `# ${c}`).join("\n");
    hints.push({
      comments: pendingComments,
      codeLine: "",
      levels: [commentBlock, commentBlock, commentBlock, commentBlock, commentBlock],
    });
  }

  return hints;
}

/**
 * Get the hint text for a specific pair and level.
 */
export function getHintText(hint: CommentHint, level: number): string {
  const idx = Math.max(0, Math.min(4, level - 1));
  return hint.levels[idx];
}

/**
 * Get the comment block only (for level 1 display).
 */
export function getCommentBlock(hint: CommentHint): string {
  return hint.comments.map((c) => `# ${c}`).join("\n");
}

/**
 * Normalise une ligne de code pour comparaison : TOUS les espaces supprimés
 * hors chaînes littérales (Python ignore les espaces : `b = int (x)` =
 * `b=int(x)`). Les espaces DANS les strings sont préservés (`"a b"` ≠ `"ab"`),
 * la casse du code est ignorée mais pas celle des strings.
 */
function normalizeCodeLine(line: string): string {
  return line
    .split(/('[^']*'|"[^"]*")/g)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/\s+/g, "").toLowerCase()))
    .join("");
}

/**
 * Smart skip : la ligne cible de l'indice est-elle déjà dans le code élève ?
 * - Match exact normalisé (espaces/casse ignorés).
 * - Équivalences d'import : `import numpy`, `import numpy as np`,
 *   `from numpy import ...` sont interchangeables (même module).
 * - Lignes vides ou purement commentaires : jamais "présentes".
 */
export function codeLineExistsInStudentCode(hintCodeLine: string, studentCode: string): boolean {
  const target = normalizeCodeLine(hintCodeLine);
  if (!target || target.startsWith("#")) return false;
  const studentLines = studentCode.split("\n").map(normalizeCodeLine);

  if (studentLines.includes(target)) return true;

  // Équivalences d'import : même module importé sous une autre forme.
  // Les lignes sont déjà normalisées (sans espaces) : `importnumpy`,
  // `fromnumpyimportarray`. Le `as alias` est ignoré (lazy + ancre fin).
  const importModule = (line: string): string | null => {
    let m = line.match(/^import([\w.]+?)(?:as\w+)?$/);
    if (m) return m[1].split(".")[0];
    m = line.match(/^from([\w.]+?)import/);
    if (m) return m[1].split(".")[0];
    return null;
  };
  const targetModule = importModule(target);
  if (targetModule) {
    return studentLines.some((l) => importModule(l) === targetModule);
  }
  return false;
}
