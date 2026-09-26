"use client";

import { useI18n } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExerciseConfirm } from "./ExerciseConfirm";
import { FileUpload } from "./FileUpload";
import type { Exercise } from "@/lib/exercise/types";

export function LandingClient() {
  const { t, locale, dir } = useI18n();
  const router = useRouter();
  const [exerciseText, setExerciseText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clarification, setClarification] = useState<string | null>(null);
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [progressStage, setProgressStage] = useState<string>("");
  const [progressMode, setProgressMode] = useState<"llm" | "heuristic" | "cache" | null>(null);
  const [meta, setMeta] = useState<Record<string, unknown> | null>(null);
  const confirmRef = useRef<HTMLElement>(null);

  // Scroll to confirmation after exercise is set — useEffect ensures DOM has rendered
  useEffect(() => {
    if (exercise) {
      const t = setTimeout(() => {
        if (confirmRef.current) confirmRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        else document.getElementById("confirm")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
      return () => clearTimeout(t);
    }
  }, [exercise]);

  // Simulated progress (A) — advances while waiting for real SSE events (B)
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  function startSimulatedProgress() {
    setProgress(5);
    setProgressStage(locale === "ar" ? "Analyse de l'énoncé…" : locale === "en" ? "Parsing exercise…" : "Analyse de l'énoncé…");
    setProgressMode(null);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    progressIntervalRef.current = setInterval(() => {
      setProgress((p) => {
        if (p < 30) return p + 4;
        if (p < 65) return p + 2;
        if (p < 92) return p + 1;
        return p;
      });
    }, 300);
  }
  function stopSimulatedProgress(final: number = 100) {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setProgress(final);
  }

  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, []);

  async function handleParse() {
    const text = exerciseText.trim();
    if (!text) {
      setError(locale === "ar" ? "الصق نص التمرين أولاً" : locale === "en" ? "Please paste the exercise text first" : "Colle d'abord l'énoncé de l'exercice");
      return;
    }
    setLoading(true);
    setError(null);
    setClarification(null);
    setExercise(null);
    setMeta(null);
    startSimulatedProgress();

    // Try SSE (B) for real-time stages, fallback to single JSON (A) if not supported
    const trySSE = async (): Promise<boolean> => {
      try {
        const res = await fetch("/api/exercise/parse", {
          method: "POST",
          headers: { "content-type": "application/json", accept: "text/event-stream" },
          body: JSON.stringify({ text, source: "typed", stream: true }),
        });
        const ct = res.headers.get("content-type") ?? "";
        if (!ct.includes("text/event-stream")) return false;
        if (!res.body) return false;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let doneExercise: Exercise | null = null;
        let doneMeta: Record<string, unknown> | null = null;
        let isExFalse: { clarification: string; detectedLanguage: string } | null = null;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const lines = part.split("\n");
            let event = "message";
            let dataStr = "";
            for (const line of lines) {
              if (line.startsWith("event:")) event = line.slice(6).trim();
              else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
            }
            if (!dataStr) continue;
            try {
              const data = JSON.parse(dataStr) as Record<string, unknown>;
              if (event === "progress") {
                const ev = data as { stage: string; progress: number; mode?: string; label?: string };
                if (typeof ev.progress === "number") setProgress(ev.progress);
                if (ev.label) setProgressStage(ev.label as string);
                if (ev.mode) setProgressMode(ev.mode as "llm" | "heuristic" | "cache");
              } else if (event === "done") {
                if ((data as { isExercise?: boolean }).isExercise === false) {
                  isExFalse = data as unknown as { clarification: string; detectedLanguage: string };
                } else {
                  doneExercise = (data as { exercise: Exercise }).exercise;
                  doneMeta = (data as { meta: Record<string, unknown> }).meta ?? null;
                  if (doneMeta && (doneMeta as { parseMode?: string }).parseMode) {
                    setProgressMode((doneMeta as { parseMode?: string }).parseMode as "llm" | "heuristic" | "cache");
                  }
                }
              } else if (event === "error") {
                throw new Error((data as { error?: string }).error ?? "SSE error");
              }
            } catch {}
          }
        }
        if (isExFalse) {
          setClarification(isExFalse.clarification ?? "Ce texte ne ressemble pas à un exercice.");
          stopSimulatedProgress(100);
          return true;
        }
        if (doneExercise) {
          setMeta(doneMeta);
          if (doneMeta && (doneMeta as { parseMode?: string }).parseMode) {
            const pm = (doneMeta as { parseMode?: string }).parseMode as "llm" | "heuristic" | "cache";
            setProgressMode(pm);
            setProgressStage(
              pm === "cache"
                ? locale === "ar" ? "Cache — réutilisé" : locale === "en" ? "Cache — reused" : "Cache — réutilisé"
                : pm === "llm"
                  ? locale === "ar" ? "Terminé — LLM" : locale === "en" ? "Done — LLM" : "Terminé — LLM"
                  : locale === "ar" ? "Terminé — local" : locale === "en" ? "Done — local" : "Terminé — local"
            );
          }
          setExercise(doneExercise);
          stopSimulatedProgress(100);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    };

    try {
      const sseOk = await trySSE();
      if (sseOk) return;
      // Fallback: single JSON (works offline, fast cache, or SSE not supported)
      // Keep simulated progress running until response
      const res = await fetch("/api/exercise/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, source: "typed" }),
      });
      const data = await res.json() as { isExercise?: boolean; exercise?: Exercise; clarification?: string; error?: string; detail?: string; meta?: Record<string, unknown> };
      if (!res.ok) {
        setError(data.error ?? "Erreur inconnue");
        return;
      }
      if (data.isExercise === false) {
        setClarification(data.clarification ?? "Ce texte ne ressemble pas à un exercice.");
        setMeta(data.meta ?? { parseMode: "heuristic" });
        setProgressMode("heuristic");
        return;
      }
      if (data.exercise) {
        setExercise(data.exercise);
        const m = data.meta as { parseMode?: string } | undefined;
        if (m?.parseMode) {
          setMeta(m as Record<string, unknown>);
          setProgressMode(m.parseMode as "llm" | "heuristic" | "cache");
          setProgressStage(
            m.parseMode === "cache"
              ? locale === "ar" ? "Cache — réutilisé" : locale === "en" ? "Cache — reused" : "Cache — réutilisé"
              : m.parseMode === "llm"
                ? locale === "ar" ? "Terminé — LLM" : locale === "en" ? "Done — LLM" : "Terminé — LLM"
                : locale === "ar" ? "Terminé — local" : locale === "en" ? "Done — local" : "Terminé — local"
          );
        }
      } else {
        setError("Réponse inattendue du serveur");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      stopSimulatedProgress(100);
      setLoading(false);
      // Hide bar after a short delay when done
      setTimeout(() => {
        setProgress(0);
        setProgressStage("");
      }, 2500);
    }
  }

  function handleConfirm(ex: Exercise) {
    // Already stored in localStorage by ExerciseConfirm
    // Navigate to workspace
    router.push(`/workspace?exerciseId=${encodeURIComponent(ex.id)}`);
  }

  return (
    <div className="flex flex-1 flex-col">
      <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
          <div className={`flex flex-col gap-6 ${dir === "rtl" ? "text-right" : "text-left"}`}>
            <p className="inline-flex w-fit rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
              {t("landing.pythonOnly")}
            </p>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              {t("landing.heroTitle")}
            </h1>
            <p className="max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
              {t("landing.heroSubtitle")}
            </p>
            <div className="flex flex-wrap gap-3">
              <a href="#pivot" className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-6 font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100">
                {t("landing.pivotTitle")} →
              </a>
              <Link href="/library" className="inline-flex h-11 items-center justify-center rounded-full border border-black/10 px-6 font-medium hover:bg-zinc-50 dark:border-white/15 dark:hover:bg-zinc-900">
                {t("landing.library")}
              </Link>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-500">{t("landing.principles")}</p>
            <p className="text-xs text-zinc-500">{t("landing.pivotSubtitle")}</p>
          </div>

          <div id="pivot" className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Link href="/teacher" className="group rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-5 shadow-sm transition hover:shadow-md dark:border-emerald-900 dark:from-emerald-950 dark:to-teal-950">
                <p className="text-xs font-medium uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Enseignant</p>
                <h3 className="mt-1 font-semibold">{t("landing.teacherCta")}</h3>
                <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{t("landing.teacherCtaDesc")}</p>
                <span className="mt-3 inline-flex text-sm font-medium text-emerald-700 group-hover:underline dark:text-emerald-300">{t("landing.teacherAction")}</span>
              </Link>
              <Link href="/student/join" className="group rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-indigo-50 p-5 shadow-sm transition hover:shadow-md dark:border-sky-900 dark:from-sky-950 dark:to-indigo-950">
                <p className="text-xs font-medium uppercase tracking-widest text-sky-700 dark:text-sky-300">Élève</p>
                <h3 className="mt-1 font-semibold">{t("landing.studentCta")}</h3>
                <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{t("landing.studentCtaDesc")}</p>
                <span className="mt-3 inline-flex text-sm font-medium text-sky-700 group-hover:underline dark:text-sky-300">{t("landing.studentAction")}</span>
              </Link>
            </div>
            <details id="start" className="group rounded-2xl border border-black/10 bg-white p-6 shadow-sm open:shadow-md dark:border-white/10 dark:bg-zinc-900">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                <span>
                  <h2 className="font-semibold">{t("landing.practiceToggle")}</h2>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{t("landing.practiceHint")}</p>
                </span>
                <span className="shrink-0 rounded-full border border-black/10 px-3 py-1 text-xs group-open:rotate-180 transition-transform">⌃</span>
              </summary>
              <div className="mt-4 border-t border-black/5 pt-4 dark:border-white/10">
                <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{t("landing.cta")}</h2>
              <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white dark:bg-white dark:text-zinc-900">Python</span>
            </div>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {locale === "fr" ? "Choisis Python pour commencer" : locale === "ar" ? "اختر بايثون للبدء" : "Pick Python to start"}
            </p>
            <label htmlFor="exercise" className="sr-only">Exercise</label>
            <textarea
              id="exercise"
              value={exerciseText}
              onChange={(e) => setExerciseText(e.target.value)}
              onInput={(e) => setExerciseText((e.target as HTMLTextAreaElement).value)}
              placeholder={t("landing.pastePlaceholder")}
              rows={8}
              className="mt-4 w-full resize-none rounded-xl border border-black/10 bg-zinc-50 p-4 text-sm placeholder:text-zinc-400 focus:border-zinc-300 focus:bg-white focus:outline-none dark:border-white/10 dark:bg-zinc-800 dark:placeholder:text-zinc-500 dark:focus:border-zinc-700 dark:focus:bg-zinc-900"
              dir={dir}
              data-testid="landing-textarea"
            />
            <div className="mt-4 flex gap-3">
              <button
                disabled={loading}
                onClick={handleParse}
                data-testid="btn-parse"
                title={!exerciseText.trim() ? "Colle d'abord l'énoncé" : undefined}
                className="flex-1 rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:disabled:bg-zinc-700"
              >
                {loading ? "Analyse…" : t("landing.choosePython")}
              </button>
            </div>
            {/* Progression — A (simulé) + B (temps réel SSE) : montre LLM vs Local vs Cache */}
            {(loading || progress > 0) && (
              <div className="mt-3 space-y-1.5" aria-live="polite" data-testid="parse-progress">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {progressStage || (loading ? (locale === "ar" ? "Analyse…" : locale === "en" ? "Analyzing…" : "Analyse…") : "")}
                  </span>
                  <span className="tabular-nums text-zinc-500">{progress > 0 ? `${Math.round(progress)}%` : ""}</span>
                </div>
                <div role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${progressMode === "cache" ? "bg-sky-500" : progressMode === "llm" ? "bg-emerald-500" : progressMode === "heuristic" ? "bg-amber-500" : "bg-emerald-500"}`}
                    style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                  />
                </div>
                {progressMode && (
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ${
                        progressMode === "llm"
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900"
                          : progressMode === "cache"
                            ? "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-900"
                            : "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900"
                      }`}
                    >
                      {progressMode === "llm" ? "LLM" : progressMode === "cache" ? "Cache" : "Local"}
                    </span>
                    <span className="text-zinc-500">
                      {progressMode === "llm"
                        ? locale === "ar" ? "IA distante" : locale === "en" ? "remote AI" : "IA distante"
                        : progressMode === "cache"
                          ? locale === "ar" ? "réutilisé" : locale === "en" ? "reused" : "réutilisé"
                          : locale === "ar" ? "heuristique hors ligne" : locale === "en" ? "offline heuristic" : "heuristique hors ligne"}
                    </span>
                    {meta && (meta as { provider?: string }).provider && progressMode === "llm" ? (
                      <span className="text-zinc-400">· {(meta as { provider?: string }).provider}</span>
                    ) : null}
                    {meta && (meta as { timings?: { totalMs?: number } }).timings?.totalMs ? (
                      <span className="text-zinc-400">· {Math.round((meta as { timings: { totalMs: number } }).timings.totalMs)}ms</span>
                    ) : null}
                  </div>
                )}
              </div>
            )}
            <FileUpload
              onSingle={(ex) => {
                setError(null);
                setClarification(null);
                setExercise(ex);
              }}
              onError={(msg) => {
                setError(msg);
                setClarification(null);
              }}
            />
            {error ? (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200" role="alert" data-testid="parse-error">
                {error}
              </div>
            ) : null}
            {clarification ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200" data-testid="parse-clarification">
                {clarification}
              </div>
            ) : null}
              </div>
            </div>
          </details>
        </div>
        </div>
      </section>

      {exercise ? (
        <section ref={confirmRef as unknown as React.RefObject<HTMLDivElement>} id="confirm" className="mx-auto w-full max-w-6xl px-4 pb-12 sm:px-6 scroll-mt-6">
          <ExerciseConfirm exercise={exercise} meta={meta} onConfirm={handleConfirm} onCancel={() => setExercise(null)} />
        </section>
      ) : null}

      <section id="how" className="border-y border-black/5 bg-zinc-50 dark:border-white/10 dark:bg-zinc-900/50">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <h2 className="text-center text-2xl font-semibold">{t("landing.howItWorks")}</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {[
              { n: "1", title: t("landing.step1Title"), desc: t("landing.step1Desc") },
              { n: "2", title: t("landing.step2Title"), desc: t("landing.step2Desc") },
              { n: "3", title: t("landing.step3Title"), desc: t("landing.step3Desc") },
            ].map((s) => (
              <div key={s.n} className="rounded-2xl border border-black/5 bg-white p-6 dark:border-white/10 dark:bg-zinc-950">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-sm font-bold text-white dark:bg-white dark:text-zinc-900">{s.n}</span>
                <h3 className="mt-3 font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          Ticket 08 — upload .txt/.md/.pdf/.docx + images (vision OCR) branché sur <code>/api/exercise/upload</code> (5 Mo, multi-exercice picker, anti-injection). Texte + fichiers partagent la même confirmation éditable.
        </div>
      </section>
    </div>
  );
}
