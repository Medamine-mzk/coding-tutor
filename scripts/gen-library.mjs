// Régénère src/lib/exercise/library.ts depuis exercices/XX-* (100% FR).
// Usage: node scripts/gen-library.mjs
// - Les ids existants sont conservés dans l'ordre (stabilité : tests, localStorage).
// - Seul le tableau RAW est régénéré ; buildExercise + exports sont préservés.
// - Étend les titres/énoncés FR depuis exercise.md (frontmatter + sections).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../exercices/", import.meta.url));
const OUT = fileURLToPath(new URL("../src/lib/exercise/library.ts", import.meta.url));
const IOSPEC = "Entrée : valeurs lues au clavier (une par ligne). Sortie : affichée sur une ou plusieurs lignes.";

function parseExerciseMd(raw) {
  const text = raw.replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const meta = {};
  let i = 0;
  if (lines[0].trim() === "---") {
    i = 1;
    while (i < lines.length && lines[i].trim() !== "---") {
      const m = lines[i].match(/^(\w+):\s*(.*)$/);
      if (m) meta[m[1]] = m[2].trim();
      i++;
    }
    i++;
  }
  const title = meta.title ?? "Sans titre";
  const concepts = (meta.concepts ?? "[loops]").replace(/[\[\]]/g, "").split(",").map((s) => s.trim()).filter(Boolean);
  const difficulty = Math.min(5, Math.max(1, parseInt(meta.difficulty ?? "2", 10) || 2));
  let statement = "";
  const examples = [];
  const constraints = [];
  let section = null;
  let pendingInput = null;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (/^#\s+Statement/i.test(line)) { section = "statement"; continue; }
    if (/^##\s+Examples/i.test(line)) { section = "examples"; continue; }
    if (/^##\s+Constraints/i.test(line)) { section = "constraints"; continue; }
    if (/^#/.test(line)) { section = null; continue; }
    if (section === "statement") statement += (statement ? "\n" : "") + line;
    else if (section === "examples") {
      const mi = line.match(/^\s*-\s*input:\s*(.*)$/);
      const mo = line.match(/^\s*output:\s*(.*)$/);
      if (mi) pendingInput = mi[1].replace(/\\n/g, "\n");
      else if (mo && pendingInput !== null) {
        examples.push({ input: pendingInput, output: mo[1].replace(/\\n/g, "\n") });
        pendingInput = null;
      }
    } else if (section === "constraints") {
      const mc = line.match(/^\s*-\s*(.*)$/);
      if (mc && mc[1].trim()) constraints.push(mc[1].trim());
    }
  }
  return { title, concepts, difficulty, statement: statement.trim(), examples, constraints };
}

function main() {
  const current = readFileSync(OUT, "utf-8");
  const rawStart = current.indexOf("const RAW: RawLib[] = [");
  const rawEnd = current.indexOf("\n];", rawStart);
  if (rawStart === -1 || rawEnd === -1) throw new Error("Structure library.ts inattendue (RAW introuvable)");
  const header = current.slice(0, rawStart);
  const footer = current.slice(rawEnd + "\n];".length);
  const existingIds = [...current.slice(rawStart, rawEnd).matchAll(/id:\s*"(lib_[^"]+)"/g)].map((m) => m[1]);
  if (existingIds.length !== 20) throw new Error(`Attendu 20 ids existants, trouvé ${existingIds.length}`);

  const dirs = readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{2}-/.test(d.name))
    .map((d) => d.name)
    .sort();
  if (dirs.length !== 20) throw new Error(`Attendu 20 dossiers, trouvé ${dirs.length}`);

  const q = (s) => JSON.stringify(s);
  const entries = dirs.map((dir, i) => {
    const md = readFileSync(join(ROOT, dir, "exercise.md"), "utf-8");
    const ex = parseExerciseMd(md);
    if (ex.examples.length === 0) throw new Error(`${dir}: aucun exemple`);
    if (!ex.constraints.length) throw new Error(`${dir}: aucune contrainte`);
    const examples = ex.examples.map((e) => `\n      { input: ${q(e.input)}, output: ${q(e.output)} },`).join("") + "\n    ";
    return `  {
    id: ${q(existingIds[i])},
    uiLocale: "fr",
    title: ${q(ex.title)},
    statement: ${q(ex.statement)},
    ioSpec: ${q(IOSPEC)},
    constraints: [${ex.constraints.map((c) => q(c)).join(", ")}],
    examples: [${examples}],
    difficulty: ${ex.difficulty},
    concepts: [${ex.concepts.map((c) => q(c)).join(", ")}],
  },`;
  });

  const out = `${header}const RAW: RawLib[] = [\n${entries.join("\n")}\n];${footer}`;
  writeFileSync(OUT, out, "utf-8");
  console.log(`OK — ${entries.length} exercices FR régénérés (ids stables).`);
}

if (import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href) {
  main();
}
