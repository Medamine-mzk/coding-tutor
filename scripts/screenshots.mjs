// Captures d'écran PyMentor pour le dossier concours.
// Usage: node scripts/screenshots.mjs
// Pré-requis: `npm run dev` actif sur http://localhost:3000 (store mémoire).
// Utilise Chrome système (pas de téléchargement). Nettoie les données demo après.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const BASE = process.env.SCREENSHOT_BASE ?? "http://localhost:3000";
const OUT = fileURLToPath(new URL("../docs/screenshots/", import.meta.url));
mkdirSync(OUT, { recursive: true });
const shot = (page, name) => page.screenshot({ path: join(OUT, name) });

const EXERCISE = {
  title: "Somme de deux entiers",
  statement:
    "Écrire un programme qui lit deux entiers a et b (chacun sur sa ligne) puis affiche leur somme.\nExemple d'entrée :\n2\n3\nExemple de sortie :\n5",
  io_spec: "Entrée : deux lignes, chacune un entier. Sortie : une ligne, la somme.",
  constraints: ["-1000 ≤ a, b ≤ 1000"],
  examples: [
    { input: "2\n3", output: "5" },
    { input: "0\n0", output: "0" },
  ],
  concepts: ["loops"],
  difficulty: 1,
  visibility: "code_only",
  reference_solution: "a=int(input())\nb=int(input())\nprint(a+b)",
};

const SOLUTION = "a = int(input())\nb = int(input())\nprint(a + b)";

async function api(ctx, method, path, body) {
  const res = await ctx.request.fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    data: body ?? undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok()) throw new Error(`${method} ${path} → ${res.status()}: ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

async function main() {
  // Pré-check serveur
  const probe = await fetch(BASE).catch(() => null);
  if (!probe || !probe.ok) throw new Error(`Dev server injoignable sur ${BASE} — lancez 'npm run dev' d'abord.`);

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  let exerciseId = null;
  let libraryId = null;
  try {
    // ---------- Setup : prof + exercices + élève ----------
    const teacherCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
    const magic = await api(teacherCtx, "POST", "/api/teacher/auth/magic-link", { email: "demo.prof@pymentor.tn", name: "M. Amine" });
    if (!magic.tokenForDev) throw new Error("tokenForDev absent — le serveur n'est pas en mode dev ?");
    await teacherCtx.request.get(`${BASE}/api/teacher/auth/verify?token=${encodeURIComponent(magic.tokenForDev)}`);

    const created = await api(teacherCtx, "POST", "/api/teacher/exercises", EXERCISE);
    exerciseId = created.exercise.id;
    const code = created.exercise.code;
    console.log(`exercice: ${exerciseId} (${code})`);
    const pub = await api(teacherCtx, "POST", `/api/teacher/exercises/${exerciseId}/publish`, {});
    console.log(`publish: verified=${pub.reference_verified} method=${pub.verification_method}`);

    const lib = await api(teacherCtx, "POST", "/api/teacher/exercises", {
      ...EXERCISE,
      title: "Moyenne de trois notes",
      visibility: "public_library",
      examples: [{ input: "10\n12\n14", output: "12.0" }],
      reference_solution: "a=float(input())\nb=float(input())\nc=float(input())\nprint((a+b+c)/3)",
    });
    libraryId = lib.exercise.id;
    await api(teacherCtx, "POST", `/api/teacher/exercises/${libraryId}/publish`, {});

    const joinRes = await api(teacherCtx, "POST", "/api/student/join", { code, display_name: "Yasmine" });
    const joinToken = joinRes.join_token;
    console.log(`join_token obtenu pour Yasmine`);

    // ---------- 01 landing ----------
    const page = await teacherCtx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await shot(page, "01-landing.png");

    // ---------- 02 student join ----------
    await page.goto(`${BASE}/student/join`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    await shot(page, "02-student-join.png");

    // ---------- Workspace ----------
    await page.goto(`${BASE}/workspace?exerciseId=${exerciseId}&join_token=${encodeURIComponent(joinToken)}`, { waitUntil: "networkidle" });
    await page.getByTestId("run-btn").waitFor({ timeout: 30000 });
    await page.waitForTimeout(1000);

    // Tape la solution dans l'éditeur (remplace le squelette)
    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type(SOLUTION, { delay: 8 });
    await page.waitForTimeout(500);

    // Exécute (Pyodide : premier chargement long)
    await page.getByTestId("run-btn").click();
    await page.getByText("prêt pour les tests").waitFor({ timeout: 240000 });
    await page.waitForTimeout(800);
    await shot(page, "03-workspace-editor.png"); // 03 page complète (3 panneaux)

    const regionShot = (name, label) =>
      page.getByRole("region", { name: label }).screenshot({ path: join(OUT, name) });

    // ---------- 04 panneau exercice ----------
    await regionShot("04-workspace-exercise.png", "Exercice");

    // ---------- 05 panneau tuteur ----------
    await page.getByTestId("tutor-input").fill("Je ne comprends pas comment lire les deux nombres");
    await page.getByTestId("tutor-send").click();
    // msg-tutor #0 = accueil ; on attend la vraie réponse (#1)
    await page.getByTestId("msg-tutor").nth(1).waitFor({ timeout: 90000 });
    await page.waitForTimeout(600);
    await regionShot("05-workspace-tutor.png", "Tuteur");

    // ---------- 06 indices (bouton dans le panneau exercice, commentaire inséré) ----------
    await page.getByTestId("request-hint").click();
    await page.getByTestId("hint-list").waitFor({ timeout: 30000 });
    await page.waitForTimeout(600);
    // 2e niveau si disponible (sinon on garde le niveau 1)
    try {
      await page.getByTestId("request-hint").click({ timeout: 5000 });
      await page.waitForTimeout(2500);
    } catch {}
    await regionShot("06-hints.png", "Éditeur");

    // ---------- 07 teacher login (contexte vierge) ----------
    const anonCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
    const anon = await anonCtx.newPage();
    await anon.goto(`${BASE}/teacher/login`, { waitUntil: "networkidle" });
    await anon.getByPlaceholder("prof@lycee.tn").fill("demo.prof@pymentor.tn");
    await anon.getByPlaceholder("Mme Ben Ali").fill("M. Amine");
    await anon.waitForTimeout(400);
    await shot(anon, "07-teacher-login.png");
    await anonCtx.close();

    // ---------- 08 dashboard ----------
    await page.goto(`${BASE}/teacher`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await shot(page, "08-teacher-dashboard.png");

    // ---------- 09 new ----------
    await page.goto(`${BASE}/teacher/exercises/new`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await shot(page, "09-teacher-new.png");

    // ---------- 10 détail + version commentée ----------
    await page.goto(`${BASE}/teacher/exercises/${exerciseId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: /version commentée/ }).click();
    await page.getByText("Solution commentée").waitFor({ timeout: 15000 });
    await page.waitForTimeout(600);
    await shot(page, "10-teacher-detail.png");

    // ---------- 11 progression ----------
    await page.goto(`${BASE}/teacher/exercises/${exerciseId}/progress`, { waitUntil: "networkidle" });
    await page.getByText("Yasmine").waitFor({ timeout: 15000 });
    await page.waitForTimeout(500);
    await shot(page, "11-teacher-progress.png");

    // ---------- 12 bibliothèque ----------
    await page.goto(`${BASE}/library`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await shot(page, "12-library.png");

    // ---------- 13 mobile ----------
    const mobCtx = await browser.newContext({
      viewport: { width: 375, height: 812 },
      isMobile: true,
      hasTouch: true,
      locale: "fr-FR",
    });
    const mob = await mobCtx.newPage();
    await mob.goto(`${BASE}/workspace?exerciseId=${exerciseId}&join_token=${encodeURIComponent(joinToken)}`, { waitUntil: "networkidle" });
    await mob.getByTestId("run-btn").waitFor({ timeout: 30000 });
    await mob.waitForTimeout(800);
    await mob.locator(".cm-content").click();
    await mob.keyboard.press("ControlOrMeta+a");
    await mob.keyboard.type(SOLUTION, { delay: 8 });
    await mob.waitForTimeout(500);
    await shot(mob, "13-mobile-workspace.png");
    await mobCtx.close();

    console.log("OK — 13 captures dans docs/screenshots/");
  } finally {
    // ---------- Cleanup ----------
    try {
      const teacherCtx = await browser.newContext({ locale: "fr-FR" });
      const magic = await api(teacherCtx, "POST", "/api/teacher/auth/magic-link", { email: "demo.prof@pymentor.tn", name: "M. Amine" });
      if (magic.tokenForDev) {
        await teacherCtx.request.get(`${BASE}/api/teacher/auth/verify?token=${encodeURIComponent(magic.tokenForDev)}`);
        for (const id of [exerciseId, libraryId]) {
          if (!id) continue;
          try {
            await api(teacherCtx, "DELETE", `/api/teacher/exercises/${id}`);
            console.log(`nettoyé: ${id}`);
          } catch (e) { console.warn(`cleanup ${id}: ${e.message}`); }
        }
      }
      await teacherCtx.close();
    } catch (e) { console.warn(`cleanup: ${e.message}`); }
    await browser.close();
  }
}

main().catch((e) => { console.error(`ECHEC: ${e.message}`); process.exit(1); });
