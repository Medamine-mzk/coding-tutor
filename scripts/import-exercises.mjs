// Importe les 20 exercices BAC (exercices/XX-*) dans un compte enseignant.
// Usage: node scripts/import-exercises.mjs [email]
// Parcourt exercise.md (frontmatter + statement + exemples + contraintes)
// et reference.py, crée via API puis publie (vérif + commentaires FR).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const BASE = process.env.IMPORT_BASE ?? "https://mypymentor.vercel.app";
const EMAIL = process.argv[2] ?? "med.amine.mzk@gmail.com";
const ROOT = fileURLToPath(new URL("../exercices/", import.meta.url));

let cookie = "";

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    const m = setCookie.match(/teacher_session=([^;]+)/);
    if (m) cookie = `teacher_session=${m[1]}`;
  }
  const json = await res.json().catch(() => ({}));
  if (res.status >= 400) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

function parseExerciseMd(raw) {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const meta = {};
  let i = 0;
  if (lines[0].trim() === "---") {
    i = 1;
    while (i < lines.length && lines[i].trim() !== "---") {
      const m = lines[i].match(/^(\w+):\s*(.*)$/);
      if (m) meta[m[1]] = m[2].trim();
      i++;
    }
    i++; // skip closing ---
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

async function main() {
  // Auth enseignant
  const magic = await api("POST", "/api/teacher/auth/magic-link", { email: EMAIL, name: "Prof" });
  if (!magic.tokenForDev) throw new Error("tokenForDev absent — import impossible sans accès dev. Demandez un vrai lien magique.");
  await api("GET", `/api/teacher/auth/verify?token=${encodeURIComponent(magic.tokenForDev)}`);
  const me = await api("GET", "/api/teacher/me");
  console.log(`connecté: ${me.teacher.email} (${me.teacher.id})`);

  // Déjà présents ? (idempotent : on saute les titres existants)
  const existing = await api("GET", "/api/teacher/exercises");
  const existingTitles = new Set((existing.exercises ?? []).map((e) => e.title));

  const dirs = readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  let created = 0, skipped = 0;
  const codes = [];
  for (const dir of dirs) {
    const mdPath = join(ROOT, dir, "exercise.md");
    const refPath = join(ROOT, dir, "reference.py");
    let md, ref;
    try { md = readFileSync(mdPath, "utf-8"); } catch { console.warn(`skip ${dir}: pas de exercise.md`); continue; }
    try { ref = readFileSync(refPath, "utf-8"); } catch { console.warn(`skip ${dir}: pas de reference.py`); continue; }
    const ex = parseExerciseMd(md);
    if (existingTitles.has(ex.title)) { console.log(`skip ${dir}: "${ex.title}" déjà présent`); skipped++; continue; }
    if (ex.examples.length === 0) { console.warn(`skip ${dir}: aucun exemple`); continue; }

    const res = await api("POST", "/api/teacher/exercises", {
      title: ex.title,
      statement: ex.statement,
      io_spec: "Entrée : valeurs lues au clavier (une par ligne). Sortie : affichée sur une ou plusieurs lignes.",
      constraints: ex.constraints,
      examples: ex.examples,
      concepts: ex.concepts,
      difficulty: ex.difficulty,
      visibility: "code_only",
      reference_solution: ref,
    });
    const id = res.exercise.id;
    const pub = await api("POST", `/api/teacher/exercises/${id}/publish`, {});
    console.log(`OK ${dir}: "${ex.title}" ${res.exercise.code} verified=${pub.reference_verified} method=${pub.verification_method ?? "?"}`);
    codes.push(`${res.exercise.code} — ${ex.title}`);
    created++;
  }
  console.log(`\nTerminé: ${created} créés, ${skipped} déjà présents.`);
  for (const c of codes) console.log(`  ${c}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`ECHEC: ${e.message}`); process.exit(1); });
}
