"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Editor } from "./Editor";
import { Console } from "./Console";
import { TutorChat } from "./TutorChat";
import { TestRunner } from "./TestRunner";
import { CompletionScreen } from "./CompletionScreen";
import { useI18n } from "@/lib/i18n";
import { PythonRunner } from "@/lib/runners/PythonRunner";
import type { RunResult, TestCase } from "@/lib/runners/LanguageRunner";
import { evaluateMilestones } from "@/lib/exercise/milestoneCheck";
import { generateSkeleton } from "@/lib/exercise/skeleton";
import { buildExerciseFromHeuristics } from "@/lib/exercise/parser";

const DEFAULT_CODE = `# Exemple - affiche la somme de deux nombres
a = int(input("a: "))
b = int(input("b: "))
print(a + b)
`;

export function WorkspaceClient() {
  const { t } = useI18n();
  const router = useRouter();
  const [code, setCode] = useState(DEFAULT_CODE);
  const [stdinInput, setStdinInput] = useState("2\n3");
  const [fontSize, setFontSize] = useState(14);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [status, setStatus] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [awaitingInput, setAwaitingInput] = useState(false);
  const [stdinQueue, setStdinQueue] = useState<string[]>([]);
  const [errorHint, setErrorHint] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"exercise" | "editor" | "tutor">("editor");
  const [largePasteNotice, setLargePasteNotice] = useState<string | null>(null);
  const [loadedExercise, setLoadedExercise] = useState<null | { id: string; title: string; statement: string; ioSpec: string; constraints: string[]; examples: Array<{ input: string; output: string }>; concepts: string[]; difficulty: number; uiLocale?: string; visibleTests?: TestCase[]; hiddenTests?: TestCase[]; milestones?: Array<{ id: string; exerciseId: string; order: number; title: string; successCriteria: string; hintSeeds: string[] }> }>(null);

  const runner = useMemo(() => new PythonRunner(), []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("currentExercise");
      if (raw) {
        const parsed = JSON.parse(raw) as typeof loadedExercise & { statement?: string; title?: string };
        // Fix for ex_h308z92 (vitesse) and login exercises that were parsed with generic fallback
        const stmt = parsed?.statement ?? "";
        const lowStmt = stmt.toLowerCase();
        const isGenericTitle = parsed?.title === "New exercise" || parsed?.title === "Nouvel exercice" || parsed?.title === "Exercice sans titre" || parsed?.title === "New exercise";
        const isVitesse = lowStmt.includes("vitesse") && lowStmt.includes("distance");
        const isAuth = (lowStmt.includes("login") || lowStmt.includes("mot de passe")) && lowStmt.includes("admin");
        if (isGenericTitle && (isVitesse || isAuth)) {
          const rebuilt = buildExerciseFromHeuristics(stmt, "typed", (parsed as unknown as { uiLocale?: string })?.uiLocale as never);
          rebuilt.id = parsed?.id ?? rebuilt.id;
          // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate and fix corrupted exercise
          setLoadedExercise(rebuilt as typeof loadedExercise);
          localStorage.setItem("currentExercise", JSON.stringify(rebuilt));
          if (code === DEFAULT_CODE || code.includes("a = int(input")) {
            setCode(generateSkeleton(rebuilt));
          }
          return;
        }
        setLoadedExercise(parsed);
        if (parsed && (code === DEFAULT_CODE || code.includes('a = int(input("a: "))'))) {
          try {
            const skeleton = generateSkeleton(parsed as unknown as import("@/lib/exercise/types").Exercise);
            if (skeleton.trim() !== code.trim()) {
              setCode(skeleton);
            }
          } catch {}
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setTheme(document.documentElement.classList.contains("dark") ? "dark" : (media.matches ? "dark" : "light"));
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    media.addEventListener("change", update);
    return () => { obs.disconnect(); media.removeEventListener("change", update); };
  }, []);

  useEffect(() => {
    if (stdinInput === "") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- derive queue from input
      setStdinQueue([]);
      return;
    }
    const raw = stdinInput.split("\n");
    let q = raw;
    if (stdinInput.endsWith("\n") && q[q.length - 1] === "") q = q.slice(0, -1);
    setStdinQueue(q);
  }, [stdinInput]);

  async function handleRun() {
    setRunning(true);
    setStatus(null);
    setErrorHint(null);
    setAwaitingInput(false);
    try {
      const result = await runner.run(code, { stdin: stdinQueue, timeoutMs: 5000 });
      setStatus(result);
      if (result.timedOut) {
        setErrorHint("Programme interrompu : boucle infinie ou calcul trop long (timeout 5s).");
      } else if (result.stderr) {
        if (result.stderr.includes("SyntaxError")) setErrorHint("Erreur de syntaxe : verifie les deux-points, parentheses et l&apos;indentation.");
        else if (result.stderr.includes("NameError")) setErrorHint("NameError : une variable ou fonction est utilisee avant d&apos;etre definie.");
        else if (result.stderr.includes("EOFError")) {
          setErrorHint("Le programme attend une entree (input) mais aucune n&apos;a ete fournie. Ajoute une ligne dans la zone stdin.");
          setAwaitingInput(true);
        } else if (result.stderr.includes("Import") && result.stderr.includes("not allowed")) {
          setErrorHint("Import non autorise. Seules les bibliotheques math, random, statistics, etc. sont permises.");
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus({ stdout: "", stderr: msg, exitCode: 1, timedOut: msg.includes("timed out"), error: msg });
    } finally {
      setRunning(false);
    }
  }

  function handleStop() {
    runner.stop();
    setRunning(false);
    setStatus((prev) => prev ? { ...prev, stderr: (prev.stderr ? prev.stderr + "\n" : "") + "Arrete par l&apos;utilisateur.", error: "stopped", timedOut: true } : { stdout: "", stderr: "Arrete par l&apos;utilisateur.", exitCode: 124, timedOut: true, error: "stopped" });
  }

  function handleLargePaste(text: string) {
    const lines = text.split("\n").length;
    setLargePasteNotice(`Collage volumineux detecte (${lines} lignes, ${text.length} caracteres). Peux-tu m&apos;expliquer ce code ? - Walk me through this part.`);
    setTimeout(() => setLargePasteNotice(null), 6000);
  }

  const demoTests: TestCase[] = useMemo(() => {
    if (loadedExercise && (loadedExercise as unknown as { visibleTests?: TestCase[] }).visibleTests) {
      const ex = loadedExercise as unknown as { visibleTests: TestCase[]; hiddenTests: TestCase[] };
      const combined = [...(ex.visibleTests ?? []), ...(ex.hiddenTests ?? [])];
      if (combined.length > 0) return combined as unknown as TestCase[];
    }
    return [
      { id: "visible-1", expected: "5", kind: "stdout", stdin: ["2", "3"], hidden: false },
      { id: "hidden-empty", expected: "0", kind: "stdout", stdin: ["0", "0"], hidden: true, category: "edge case with zero" },
    ];
  }, [loadedExercise]);

  const [testReport, setTestReport] = useState<null | Awaited<ReturnType<PythonRunner["runTests"]>>>(null);

  const milestoneStatuses = useMemo(() => {
    if (!loadedExercise?.milestones?.length) return null;
    return evaluateMilestones(
      loadedExercise.milestones as unknown as import("@/lib/exercise/types").Milestone[],
      code,
      testReport as unknown as import("@/lib/runners/LanguageRunner").TestReport | null
    );
  }, [loadedExercise, code, testReport]);

  const isCompleted = !!(testReport && testReport.total > 0 && testReport.passed === testReport.total);

  async function handleRunTests() {
    setRunning(true);
    const report = await runner.runTests(code, demoTests);
    setTestReport(report);
    setRunning(false);
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex border-b border-black/10 bg-white dark:border-white/10 dark:bg-zinc-950 lg:hidden">
        {([
          ["exercise", t("workspace.exercise")],
          ["editor", t("workspace.editor") + " / " + t("workspace.console")],
          ["tutor", t("workspace.tutor")],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} className={`flex-1 px-3 py-3 text-sm font-medium ${activeTab === key ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-white dark:text-white" : "text-zinc-500"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4 lg:grid lg:grid-cols-[300px_1fr_340px] lg:gap-4 lg:p-4">
        <div role="region" aria-label={t("workspace.exercise") + " & " + (t("workspace.steps") ?? "Steps")} className={`${activeTab !== "exercise" ? "hidden lg:flex" : "flex"} flex-col gap-4`}>
          <div className="rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
            <h2 className="font-semibold">{loadedExercise?.title ?? t("workspace.exercise")}</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{loadedExercise ? loadedExercise.statement.slice(0, 160) : "Exemple : lire deux entiers et afficher leur somme."}</p>
            <div className="mt-3 rounded-xl bg-zinc-50 p-3 text-sm dark:bg-zinc-800">
              <p className="font-medium">Enonce</p>
              <p className="mt-1 leading-6">{loadedExercise?.statement ?? "Lire deux entiers sur deux lignes et afficher leur somme sur une ligne."}</p>
              <p className="mt-2 font-medium">Exemple</p>
              <pre className="mt-1 rounded bg-white p-2 font-mono text-xs dark:bg-zinc-900">
                {loadedExercise?.examples[0] ? `Entree: ${loadedExercise.examples[0].input} -> Sortie: ${loadedExercise.examples[0].output}` : "Entree: 2 3 -> Sortie: 5"}
              </pre>
              <p className="mt-2 text-xs text-zinc-500">Contraintes : {loadedExercise?.constraints[0] ?? "-1000 ≤ a,b ≤ 1000"}</p>
              {loadedExercise?.concepts?.length ? <p className="mt-1 text-xs text-zinc-500">Concepts: {loadedExercise.concepts.join(", ")}</p> : null}
              <p className="mt-1 text-xs text-zinc-500">{loadedExercise?.ioSpec ?? ""}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
            <h3 className="text-sm font-semibold">{t("workspace.steps") ?? "Etapes"}</h3>
            {milestoneStatuses ? (
              <ul className="mt-3 space-y-2 text-sm" data-testid="milestone-list">
                {milestoneStatuses.map(({ milestone, completed }) => (
                  <li key={milestone.id} data-testid={`milestone-${milestone.id}`} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${completed ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950" : "border-black/5 dark:border-white/10"}`}>
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${completed ? "bg-emerald-600 text-white" : "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"}`}>{completed ? "✓" : milestone.order}</span>
                    <span className={`${completed ? "text-emerald-800 dark:text-emerald-200" : "text-zinc-700 dark:text-zinc-300"}`}>{milestone.title}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {["Lire les entrees", "Convertir en entiers", "Calculer la somme", "Afficher le resultat"].map((title, i) => (
                  <li key={title} className="flex items-center gap-2 rounded-lg border border-black/5 px-3 py-2 dark:border-white/10">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-xs text-white dark:bg-white dark:text-zinc-900">{i + 1}</span>
                    <span className="text-zinc-700 dark:text-zinc-300">{title}</span>
                  </li>
                ))}
              </ul>
            )}
            {milestoneStatuses ? (
              <p className="mt-2 text-xs text-zinc-500">
                {milestoneStatuses.filter((s) => s.completed).length}/{milestoneStatuses.length} étapes validées · Suivant : {milestoneStatuses.find((s) => !s.completed)?.milestone.title ?? "toutes validées !"}
              </p>
            ) : loadedExercise?.milestones?.length ? (
              <p className="mt-2 text-xs text-zinc-500">{loadedExercise.milestones.length} étapes générées (3-7) — titres seulement, critères internes</p>
            ) : null}
          </div>
        </div>

        <div role="region" aria-label={`${t("workspace.editor")} & ${t("workspace.console")}`} className={`${activeTab !== "editor" ? "hidden lg:flex" : "flex"} flex flex-col gap-3`}>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-zinc-900">
            <div className="flex items-center gap-2">
              <button onClick={handleRun} disabled={running} data-testid="run-btn" className="inline-flex h-9 items-center gap-2 rounded-full bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:disabled:bg-zinc-700">
                <span aria-hidden>▶</span> {t("workspace.run")}
              </button>
              <button onClick={handleStop} disabled={!running} data-testid="stop-btn" className="inline-flex h-9 items-center gap-2 rounded-full border border-black/10 bg-white px-4 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-white/15 dark:bg-zinc-800 dark:hover:bg-zinc-700">
                ■ {t("workspace.stop")}
              </button>
              <button onClick={handleRunTests} disabled={running} className="hidden h-9 items-center rounded-full border border-black/10 bg-white px-4 text-sm sm:inline-flex dark:border-white/15 dark:bg-zinc-800">
                Tests
              </button>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-600 dark:text-zinc-400">Font</label>
              <button onClick={() => setFontSize((s) => Math.max(10, s - 1))} className="h-8 w-8 rounded-full border border-black/10 dark:border-white/15">-</button>
              <span className="w-8 text-center text-sm">{fontSize}</span>
              <button onClick={() => setFontSize((s) => Math.min(24, s + 1))} className="h-8 w-8 rounded-full border border-black/10 dark:border-white/15">+</button>
            </div>
          </div>

          {largePasteNotice ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200" data-testid="paste-notice">
              {largePasteNotice}
            </div>
          ) : null}

          <div className="min-h-[320px] flex-1">
            <Editor value={code} onChange={setCode} onLargePaste={handleLargePaste} theme={theme} fontSize={fontSize} placeholder={t("landing.pastePlaceholder")} />
          </div>

          <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
            <div className="rounded-xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-zinc-900">
              <label htmlFor="stdin" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">stdin (une valeur par ligne pour input())</label>
              <textarea
                id="stdin"
                value={stdinInput}
                onChange={(e) => setStdinInput(e.target.value)}
                rows={4}
                placeholder={"2\n3"}
                className="mt-2 w-full rounded-lg border border-black/10 bg-zinc-50 p-2 font-mono text-sm dark:border-white/10 dark:bg-zinc-800"
                data-testid="stdin-input"
              />
              <p className="mt-1 text-xs text-zinc-500">Exemple : 2 lignes pour deux appels a input()</p>
            </div>
            <Console
              stdout={status?.stdout ?? ""}
              stderr={status?.stderr ?? ""}
              awaitingInput={awaitingInput}
              inputPrompt="input()"
              onSubmitInput={(val) => {
                setStdinInput((prev) => (prev ? prev + "\n" + val : val));
                setAwaitingInput(false);
                setErrorHint(null);
              }}
            />
          </div>

          {errorHint ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200" role="status">
              {errorHint}
            </div>
          ) : null}
          {status && !status.timedOut && !status.stderr && status.stdout ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
              Sortie : <span className="font-mono">{status.stdout.trimEnd().split("\n").pop()}</span> - pret pour les tests
            </div>
          ) : null}

          {isCompleted && loadedExercise ? (
            <CompletionScreen
              exercise={{
                title: loadedExercise.title,
                concepts: loadedExercise.concepts as unknown as import("@/lib/exercise/types").Concept[],
                difficulty: loadedExercise.difficulty as 1 | 2 | 3 | 4 | 5,
                milestones: (loadedExercise.milestones ?? []) as unknown as import("@/lib/exercise/types").Milestone[],
              }}
              onRetry={() => setTestReport(null)}
              onContinue={() => {
                localStorage.removeItem("currentExercise");
                router.push("/");
              }}
            />
          ) : null}
          {testReport ? (
            <TestRunner tests={demoTests as unknown as import("@/lib/exercise/types").TestCase[]} report={testReport as unknown as import("@/lib/runners/LanguageRunner").TestReport} running={running} />
          ) : null}
        </div>

        <div role="region" aria-label={t("workspace.tutor")} className={`${activeTab !== "tutor" ? "hidden lg:flex" : "flex"} flex-col gap-4`}>
          <TutorChat
            exercise={
              loadedExercise
                ? {
                    id: (loadedExercise as unknown as { id?: string }).id ?? "ex_unknown",
                    title: loadedExercise.title,
                    statement: loadedExercise.statement,
                    ioSpec: loadedExercise.ioSpec,
                    constraints: loadedExercise.constraints,
                    examples: loadedExercise.examples,
                    concepts: loadedExercise.concepts,
                    milestones: (loadedExercise.milestones ?? []).map((m: { title: string }) => ({ title: m.title })),
                  }
                : undefined
            }
            code={code}
            lastRunResult={status}
            testReport={testReport as unknown as { passed: number; failed: number; total: number; results: Array<{ testId: string; passed: boolean; message?: string }> } | null}
            currentMilestoneTitle={loadedExercise?.milestones?.[0]?.title}
            tests={demoTests as unknown as Array<{ id: string; input?: string; stdin?: string[]; expected: string; kind: "stdout" | "call"; fnCall?: string; hidden: boolean; category?: string }>}
          />
        </div>
      </div>
    </div>
  );
}
