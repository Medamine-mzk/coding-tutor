"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Editor, type EditorHandle } from "./Editor";
import { Console } from "./Console";
import { TutorChat } from "./TutorChat";
import { TestRunner } from "./TestRunner";
import { CompletionScreen } from "./CompletionScreen";
import { useI18n } from "@/lib/i18n";
import { PythonRunner } from "@/lib/runners/PythonRunner";
import type { RunResult, TestCase } from "@/lib/runners/LanguageRunner";
import { generateSkeleton } from "@/lib/exercise/skeleton";
import { buildExerciseFromHeuristics } from "@/lib/exercise/parser";
import { formatStatementBody } from "@/lib/exercise/formatStatement";
import { hintToCommentBlock } from "@/lib/tutor/insertComment";

const DEFAULT_CODE = `# Exemple - écris ton code ici
`;

// L'éditeur contient encore le code par défaut (vierge) : on peut le remplacer
// par le squelette de l'exercice sans écraser le travail de l'élève.
function isDefaultCode(code: string): boolean {
  return code === DEFAULT_CODE;
}

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
  const [isTeacherMode, setIsTeacherMode] = useState(false);

  const [loadedExercise, setLoadedExercise] = useState<null | { id: string; title: string; statement: string; ioSpec: string; constraints: string[]; examples: Array<{ input: string; output: string }>; concepts: string[]; difficulty: number; uiLocale?: string; visibleTests?: TestCase[]; hiddenTests?: TestCase[] }>(null);
  // Indices guidés (comment-based, serveur) : un par paire commentaire/code
  const [hints, setHints] = useState<Array<{ pairIndex: number; level: number; text: string }>>([]);
  const [hintsTotal, setHintsTotal] = useState<number | null>(null);
  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [hintsDone, setHintsDone] = useState(false);
  const [hintsLoading, setHintsLoading] = useState(false);
  const [hintsNote, setHintsNote] = useState<string | null>(null);
  const [joinToken, setJoinToken] = useState<string | null>(null);
  const hasRunRef = useRef(false);
  const editorRef = useRef<EditorHandle | null>(null);
  // Garde partagée avec TutorChat : un commentaire inséré n'est pas une
  // progression élève (ne fait pas escalader le ladder).
  const insertionGuardRef = useRef(false);

  const runner = useMemo(() => new PythonRunner(), []);

  function handleInsertCommentBlock(block: string): boolean {
    const ok = editorRef.current?.insertComment(block) ?? false;
    if (ok) insertionGuardRef.current = true;
    return ok;
  }

  useEffect(() => {
    // Detect teacher mode for banner (after mount to avoid SSR mismatch)
    try {
      if (localStorage.getItem("student_join_token")) setIsTeacherMode(true);
    } catch {}
    // Teacher flow: if join_token in URL or localStorage, fetch teacher's exercise
    // Keep sync fallback for practice mode (paste) so tests see milestones immediately
    const urlParams = new URLSearchParams(window.location.search);
    const joinTokenFromUrl = urlParams.get("join_token") ?? urlParams.get("joinToken");
    const joinToken = joinTokenFromUrl ?? (() => { try { return localStorage.getItem("student_join_token"); } catch { return null; } })();
    if (joinToken) {
      if (!isTeacherMode) setIsTeacherMode(true);
      (async () => {
        try {
          const res = await fetch(`/api/student/exercise?join_token=${encodeURIComponent(joinToken)}`);
          if (res.ok) {
            const data = (await res.json()) as { exercise: import("@/lib/exercise/types").Exercise };
            if (data.exercise) {
              setLoadedExercise(data.exercise as unknown as typeof loadedExercise);
              try {
                const skeleton = generateSkeleton(data.exercise as unknown as import("@/lib/exercise/types").Exercise);
                if (isDefaultCode(code)) {
                  setCode(skeleton);
                }
              } catch {}
              return;
            }
          }
        } catch {}
        // Fallback to localStorage if teacher fetch fails
        tryLoadFromStorage();
      })();
      return;
    }

    function tryLoadFromStorage() {
      try {
        const raw = localStorage.getItem("currentExercise");
        if (raw) {
          const parsed = JSON.parse(raw) as typeof loadedExercise & { statement?: string; title?: string };
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
            if (isDefaultCode(code)) {
              setCode(generateSkeleton(rebuilt));
            }
            return;
          }
          setLoadedExercise(parsed);
          if (parsed && isDefaultCode(code)) {
            try {
              const skeleton = generateSkeleton(parsed as unknown as import("@/lib/exercise/types").Exercise);
              if (skeleton.trim() !== code.trim()) {
                setCode(skeleton);
              }
            } catch {}
          }
        }
      } catch {}
    }

    tryLoadFromStorage();
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
        if (result.stderr.includes("SyntaxError")) setErrorHint("Erreur de syntaxe : vérifie les deux-points, les parenthèses et l'indentation.");
        else if (result.stderr.includes("NameError")) setErrorHint("NameError : une variable ou fonction est utilisée avant d'être définie.");
        else if (result.stderr.includes("EOFError")) {
          setErrorHint("Le programme attend une entrée (input) mais aucune n'a été fournie. Ajoute une ligne dans la zone stdin.");
          setAwaitingInput(true);
        } else if (result.stderr.includes("Import") && result.stderr.includes("not allowed")) {
          setErrorHint("Import non autorisé. Seules les bibliothèques autorisées (math, random, etc.) sont permises.");
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus({ stdout: "", stderr: msg, exitCode: 1, timedOut: msg.includes("timed out"), error: msg });
    } finally {
      setRunning(false);
      hasRunRef.current = true;
    }
  }

  function handleStop() {
    runner.stop();
    setRunning(false);
    setStatus((prev) => prev ? { ...prev, stderr: (prev.stderr ? prev.stderr + "\n" : "") + "Arrêté par l'utilisateur.", error: "stopped", timedOut: true } : { stdout: "", stderr: "Arrêté par l'utilisateur.", exitCode: 124, timedOut: true, error: "stopped" });
  }

  function handleLargePaste(text: string) {
    const lines = text.split("\n").length;
    setLargePasteNotice(`Collage volumineux détecté (${lines} lignes, ${text.length} caractères). Peux-tu m'expliquer ce code ?`);
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

  // join_token (classe) : nécessaire pour les indices guidés serveur
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      setJoinToken(
        urlParams.get("join_token") ?? urlParams.get("joinToken") ?? (() => { try { return localStorage.getItem("student_join_token"); } catch { return null; } })()
      );
    } catch {
      setJoinToken(null);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture initiale une fois
  }, []);

  // Énoncé nettoyé (sans marqueurs markdown) pour les blocs riches
  const stmtBody = useMemo(
    () => (loadedExercise ? formatStatementBody(loadedExercise.statement) : ""),
    [loadedExercise]
  );
  const panelExamples = loadedExercise?.examples ?? [];
  const panelConstraints = loadedExercise?.constraints ?? [];

  const isCompleted = !!(testReport && testReport.total > 0 && testReport.passed === testReport.total);

  // Teacher dashboard: report code snapshot + completion (progression = indices révélés côté serveur)
  useEffect(() => {
    if (!loadedExercise) return;
    const sessionId = (() => { try { return localStorage.getItem("currentSessionId"); } catch { return null; } })();
    if (!sessionId) return; // practice mode (no teacher) — nothing to report
    fetch(`/api/student/session/${encodeURIComponent(sessionId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        currentCode: code.slice(0, 2000), // store snippet for dashboard, not full code
        status: isCompleted ? "completed" : "in_progress",
        ...(isCompleted ? { finishedAt: new Date().toISOString() } : {}),
      }),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/set-state-in-effect -- rapport ponctuel
  }, [isCompleted, loadedExercise]);

  async function handleRunTests() {
    setRunning(true);
    const report = await runner.runTests(code, demoTests);
    setTestReport(report);
    setRunning(false);
    hasRunRef.current = true;
  }

  // Indice guidé suivant : serveur révèle la paire commentaire/code (niveaux 1-5),
  // puis le texte est inséré en commentaire à la place du curseur.
  async function handleRequestHint() {
    if (hintsLoading || hintsDone || !joinToken) return;
    setHintsLoading(true);
    setHintsNote(null);
    try {
      const res = await fetch("/api/student/hints", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ join_token: joinToken, hasRun: hasRunRef.current }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur indices");
      hasRunRef.current = false;
      setHintsTotal(data.totalPairs ?? null);
      setHintsRevealed(data.revealedCount ?? 0);
      if (data.done) {
        setHintsDone(true);
        return;
      }
      const item = { pairIndex: data.pairIndex as number, level: data.level as number, text: data.text as string };
      setHints((prev) => {
        const i = prev.findIndex((h) => h.pairIndex === item.pairIndex);
        if (i >= 0) {
          const next = [...prev];
          next[i] = item;
          return next;
        }
        return [...prev, item];
      });
      if (data.capped) setHintsNote(data.note ?? "Exécute ton code (Run) pour débloquer les niveaux 4-5.");
      handleInsertCommentBlock(hintToCommentBlock(item.text, `💡 Indice ${item.pairIndex + 1} (niveau ${item.level}) :`));
    } catch (e) {
      setHintsNote(e instanceof Error ? e.message : String(e));
    } finally {
      setHintsLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex border-b border-black/10 bg-white dark:border-white/10 dark:bg-zinc-950 lg:hidden">
        {([
          ["exercise", t("workspace.exercise")],
          ["editor", t("workspace.editor") + " / " + t("workspace.console")],
          ["tutor", t("workspace.tutor")],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} className={`flex-1 px-3 py-3 text-sm font-medium ${activeTab === key ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-white dark:text-white" : "text-zinc-600"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4 lg:grid lg:grid-cols-[300px_1fr_340px] lg:gap-4 lg:p-4">
        <div role="region" aria-label={t("workspace.exercise") + " & " + (t("workspace.steps") ?? "Steps")} className={`${activeTab !== "exercise" ? "hidden lg:flex" : "flex"} flex-col gap-4`}>
          <div className="rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
            <h2 className="font-semibold">{loadedExercise?.title ?? t("workspace.exercise")}</h2>
            {isTeacherMode ? (
              <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-sky-200 dark:bg-sky-950 dark:text-sky-300">
                Mode classe — progression partagée avec l'enseignant
              </p>
            ) : null}
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{loadedExercise ? stmtBody.slice(0, 160) : "Exemple : lire deux entiers et afficher leur somme."}</p>
            <div className="mt-3 rounded-xl bg-zinc-50 p-3 text-sm dark:bg-zinc-800">
              <p className="font-medium">Énoncé</p>
              <p className="mt-1 leading-6 whitespace-pre-line">{loadedExercise ? stmtBody : "Lire deux entiers sur deux lignes et afficher leur somme sur une ligne."}</p>
              <p className="mt-3 font-medium">Exemple{panelExamples.length > 1 ? "s" : ""}</p>
              {panelExamples.length > 0 ? (
                <div className="mt-1 space-y-1.5">
                  {panelExamples.map((ex, i) => (
                    <pre key={i} className="rounded bg-white p-2 font-mono text-xs whitespace-pre-wrap dark:bg-zinc-900">
                      Entrée : {ex.input} {"->"} Sortie : {ex.output}
                    </pre>
                  ))}
                </div>
              ) : (
                <pre className="mt-1 rounded bg-white p-2 font-mono text-xs dark:bg-zinc-900">
                  Entrée : 2 3 {"->"} Sortie : 5
                </pre>
              )}
              <p className="mt-3 font-medium">Contraintes</p>
              {panelConstraints.length > 0 ? (
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-zinc-600 dark:text-zinc-400">
                  {panelConstraints.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">-1000 ≤ a,b ≤ 1000</p>
              )}
              {loadedExercise?.concepts?.length ? <p className="mt-2 text-xs text-zinc-600">Concepts : {loadedExercise.concepts.join(", ")}</p> : null}
              {loadedExercise?.ioSpec ? <p className="mt-1 text-xs text-zinc-600">{loadedExercise.ioSpec}</p> : null}
            </div>
          </div>
          <div className="rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
            <h3 className="text-sm font-semibold">💡 Indices guidés</h3>
            {!joinToken ? (
              <p className="mt-2 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
                Les indices guidés pas à pas sont disponibles en mode classe (rejoins avec un code PY-XXXX). En mode pratique, utilise le tuteur ci-contre.
              </p>
            ) : (
              <>
                <button
                  onClick={handleRequestHint}
                  disabled={hintsLoading || hintsDone}
                  data-testid="request-hint"
                  aria-label="Révéler l'indice suivant et l'insérer en commentaire dans l'éditeur"
                  className="mt-2 w-full rounded-full bg-amber-400 px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-amber-300 disabled:opacity-50 dark:bg-amber-500 dark:text-zinc-950 dark:hover:bg-amber-400"
                >
                  {hintsLoading ? "Chargement…" : hintsDone ? "Tous les indices révélés ✓" : "💡 Indice suivant"}
                </button>
                {hintsTotal !== null ? (
                  <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400" data-testid="hint-progress">
                    {hintsRevealed}/{hintsTotal} indices révélés
                  </p>
                ) : null}
                {hintsNote ? (
                  <p className="mt-2 rounded-xl bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200" role="status">
                    {hintsNote}
                  </p>
                ) : null}
                {hints.length > 0 ? (
                  <ul className="mt-3 space-y-2 text-sm" data-testid="hint-list">
                    {hints.map((h) => (
                      <li key={h.pairIndex} data-testid={`hint-${h.pairIndex}`} className="rounded-lg border border-black/5 px-3 py-2 dark:border-white/10">
                        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                          Indice {h.pairIndex + 1} · niveau {h.level}/5
                        </p>
                        <pre className="mt-1 overflow-auto whitespace-pre-wrap font-mono text-xs text-zinc-600 dark:text-zinc-400">{h.text}</pre>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div role="region" aria-label={`${t("workspace.editor")} & ${t("workspace.console")}`} className={`${activeTab !== "editor" ? "hidden lg:flex" : "flex"} flex flex-col gap-3`}>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-zinc-900">
            <div className="flex items-center gap-2">
              <button onClick={handleRun} disabled={running} data-testid="run-btn" className="inline-flex h-9 items-center gap-2 rounded-full bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400 dark:disabled:bg-zinc-700">
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
            <Editor ref={editorRef} value={code} onChange={setCode} onLargePaste={handleLargePaste} theme={theme} fontSize={fontSize} placeholder={t("landing.pastePlaceholder")} />
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
              <p className="mt-1 text-xs text-zinc-600">Exemple : 2 lignes pour deux appels à input()</p>
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
              Sortie : <span className="font-mono">{status.stdout.trimEnd().split("\n").pop()}</span> — prêt pour les tests
            </div>
          ) : null}

          {isCompleted && loadedExercise ? (
            <CompletionScreen
              exercise={{
                title: loadedExercise.title,
                concepts: loadedExercise.concepts as unknown as import("@/lib/exercise/types").Concept[],
                difficulty: loadedExercise.difficulty as 1 | 2 | 3 | 4 | 5,
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
                  }
                : undefined
            }
            code={code}
            lastRunResult={status}
            testReport={testReport as unknown as { passed: number; failed: number; total: number; results: Array<{ testId: string; passed: boolean; message?: string }> } | null}
            tests={demoTests as unknown as Array<{ id: string; input?: string; stdin?: string[]; expected: string; kind: "stdout" | "call"; fnCall?: string; hidden: boolean; category?: string }>}
            insertionGuard={insertionGuardRef}
          />
        </div>
      </div>
    </div>
  );
}
