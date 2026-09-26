"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type StepDraft = {
  title: string;
  goal: string;
  check_type: "io_test" | "function_test" | "ast_check";
  io_test?: { stdin: string[]; expected_stdout: string } | null;
  function_test?: { function_name: string; args: unknown[]; expected: unknown } | null;
  ast_check?: { must_contain: string[]; must_not_contain?: string[] } | null;
};

export default function NewExercisePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"manual" | "llm" | "upload">("manual");

  // Manual
  const [title, setTitle] = useState("Exercice exemple — somme");
  const [statement, setStatement] = useState("Écrire un programme qui lit deux entiers et affiche leur somme.\nInput : 2 3\nOutput : 5");
  const [examples, setExamples] = useState("2 3 -> 5\n0 0 -> 0");
  const [steps, setSteps] = useState<StepDraft[]>([
    { title: "Lire les entrées", goal: "Lire deux entiers avec input()", check_type: "ast_check", ast_check: { must_contain: ["input"] } },
    { title: "Calculer la somme", goal: "Calculer a+b", check_type: "ast_check", ast_check: { must_contain: ["+"] } },
    { title: "Afficher le résultat", goal: "Afficher la somme", check_type: "io_test", io_test: { stdin: ["2", "3"], expected_stdout: "5" } },
  ]);
  const [visibility, setVisibility] = useState<"code_only" | "public_library">("code_only");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // LLM
  const [llmText, setLlmText] = useState("");
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmProgress, setLlmProgress] = useState(0);
  const [llmStage, setLlmStage] = useState("");
  const [llmMode, setLlmMode] = useState<"llm" | "heuristic" | "cache" | null>(null);
  const [suggestions, setSuggestions] = useState<Array<{ code: string; title: string }>>([]);
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const [draftWarnings, setDraftWarnings] = useState<string[]>([]);
  const [draftIsGeneric, setDraftIsGeneric] = useState(false);
  const [draftGenericWarning, setDraftGenericWarning] = useState<{ title: string; body: string; suggestion: { input: string; output: string } | null } | null>(null);
  // Derived from draft or API genericWarning — for display
  const getDraftWarningState = () => {
    const d = draft as Record<string, unknown> & {
      examples?: Array<{ input: string; output: string }>;
      genericWarning?: { title: string; body: string; suggestion: { input: string; output: string } | null };
      _genericWarning?: { title: string; body: string; suggestion: { input: string; output: string } | null };
      warnings?: string[];
      isGeneric?: boolean;
    } | null;
    const apiGw = draftGenericWarning;
    const draftGw = d?.genericWarning ?? d?._genericWarning ?? null;
    const gw = apiGw ?? draftGw ?? null;
    const isGen = d?.examples?.[0]?.input === "exemple entrée" || d?.isGeneric || draftIsGeneric || !!gw;
    const warns = d?.warnings ?? draftWarnings;
    return { isGen, gw, warns };
  };

  // Upload
  const [exerciseMdFile, setExerciseMdFile] = useState<File | null>(null);
  const [stepsJsonFile, setStepsJsonFile] = useState<File | null>(null);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);

  const inputCls = "rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:outline-none dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500";
  const textareaCls = "rounded-xl border border-black/10 bg-white p-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:outline-none dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500";
  const smallInputCls = "rounded-lg border border-black/10 bg-white px-2 py-1 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-100";
  const selectCls = "rounded-lg border border-black/10 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-100";

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const exs = examples
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => {
          const parts = line.split("->");
          if (parts.length === 2) return { input: parts[0].trim(), output: parts[1].trim() };
          const arrow = line.includes("→") ? "→" : null;
          if (arrow) {
            const [a, b] = line.split(arrow);
            return { input: a.trim(), output: b.trim() };
          }
          return { input: line, output: "" };
        });

      const stepsPayload = steps.map((s, idx) => ({
        id: `s${idx + 1}`,
        order: idx + 1,
        title: s.title,
        goal: s.goal,
        check_type: s.check_type,
        io_test: s.io_test ?? null,
        function_test: s.function_test ?? null,
        ast_check: s.ast_check ?? null,
        hint_seeds: {},
        exerciseId: "tmp",
        successCriteria: s.check_type,
        hintSeeds: [],
      }));

      const res = await fetch("/api/teacher/exercises", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          statement: statement.trim(),
          io_spec: "Entrée: une ligne, Sortie: une ligne",
          constraints: ["-1000 ≤ n ≤ 1000"],
          examples: exs,
          concepts: ["loops", "lists"],
          difficulty: 2,
          steps: stepsPayload,
          hidden_tests: [],
          visible_tests: exs.slice(0, 2).map((eg, i) => ({ id: `t_vis_${i}`, input: eg.input, stdin: eg.input.split(/[ \n]+/), expected: eg.output, kind: "stdout", hidden: false })),
          visibility,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur création");
      router.push(`/teacher/exercises/${data.exercise.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleLlmGenerate() {
    if (!llmText.trim()) {
      setError("Colle d'abord l'énoncé");
      return;
    }
    setLlmLoading(true);
    setError(null);
    setDraft(null);
    setSuggestions([]);
    setDraftWarnings([]);
    setDraftIsGeneric(false);
    setDraftGenericWarning(null);
    setLlmProgress(5);
    setLlmStage("Analyse de l'énoncé…");
    setLlmMode(null);

    const interval = setInterval(() => {
      setLlmProgress((p) => (p < 30 ? p + 4 : p < 65 ? p + 2 : p < 92 ? p + 1 : p));
    }, 300);

    try {
      const trySse = async (): Promise<boolean> => {
        try {
          const res = await fetch("/api/teacher/exercises/generate", {
            method: "POST",
            headers: { "content-type": "application/json", accept: "text/event-stream" },
            body: JSON.stringify({ text: llmText, stream: true }),
          });
          const ct = res.headers.get("content-type") ?? "";
          if (!ct.includes("text/event-stream") || !res.body) return false;
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let doneDraft: Record<string, unknown> | null = null;
          let doneSuggestions: Array<{ code: string; title: string }> = [];
          let doneMeta: Record<string, unknown> | null = null;
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
              const data = JSON.parse(dataStr) as Record<string, unknown>;
              if (event === "progress") {
                const ev = data as { progress: number; label?: string; mode?: string };
                if (typeof ev.progress === "number") setLlmProgress(ev.progress);
                if (ev.label) setLlmStage(ev.label as string);
                if ((ev as { mode?: string }).mode) setLlmMode((ev as { mode: string }).mode as "llm" | "heuristic" | "cache");
              } else if (event === "done") {
                if ((data as { isExercise?: boolean }).isExercise === false) {
                  throw new Error((data as { clarification?: string }).clarification ?? "Non exercice");
                }
                doneDraft = (data as { draft: Record<string, unknown> }).draft;
                doneSuggestions = (data as { suggestions?: Array<{ code: string; title: string }> }).suggestions ?? [];
                doneMeta = (data as { meta?: Record<string, unknown> }).meta ?? null;
                // Capture top-level warnings/isGeneric/genericWarning for SSE
                const maybeWarnings = (data as { warnings?: string[] }).warnings;
                const maybeIsGeneric = (data as { isGeneric?: boolean }).isGeneric;
                const maybeGw = (data as { genericWarning?: { title: string; body: string; suggestion: { input: string; output: string } | null } }).genericWarning;
                if (maybeWarnings) setDraftWarnings(maybeWarnings as string[]);
                if (typeof maybeIsGeneric === "boolean") setDraftIsGeneric(maybeIsGeneric as boolean);
                if (maybeGw) setDraftGenericWarning(maybeGw as { title: string; body: string; suggestion: { input: string; output: string } | null });
              }
            }
          }
          if (doneDraft) {
            // SSE done event may contain warnings/isGeneric/genericWarning at top level — they were in the done event's data, not just draft
            // We need to capture them from the last SSE data's top level, but our doneDraft is just the draft, not the full done event
            // For now, the JSON fallback below will handle the full warnings, but for SSE we can also check if doneDraft has them
            // The actual done event's data includes them at top level, but we lost them when we only stored draft
            // To fix, we should have stored them when we parsed the done event — do it there
            const lastData = doneDraft as unknown as { warnings?: string[]; isGeneric?: boolean; genericWarning?: { title: string; body: string; suggestion: { input: string; output: string } | null } };
            if (lastData.warnings) setDraftWarnings(lastData.warnings as string[]);
            if (typeof lastData.isGeneric === "boolean") setDraftIsGeneric(lastData.isGeneric as boolean);
            if ((lastData as { genericWarning?: unknown }).genericWarning) setDraftGenericWarning((lastData as { genericWarning: { title: string; body: string; suggestion: { input: string; output: string } | null } }).genericWarning);
            setDraft({ ...doneDraft, _meta: doneMeta } as Record<string, unknown>);
            setSuggestions(doneSuggestions);
            if (doneMeta && (doneMeta as { parseMode?: string }).parseMode) {
              setLlmMode((doneMeta as { parseMode: string }).parseMode as "llm" | "heuristic" | "cache");
            }
            return true;
          }
          return false;
        } catch {
          return false;
        }
      };

      const sseOk = await trySse();
      if (sseOk) {
        clearInterval(interval);
        setLlmProgress(100);
        setLlmStage("Brouillon prêt — à relire");
        return;
      }

      const res = await fetch("/api/teacher/exercises/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: llmText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur génération");
      if (data.isExercise === false) throw new Error(data.clarification ?? "Non exercice");
      setDraft({ ...data.draft, _meta: data.meta } as Record<string, unknown>);
      setSuggestions(data.suggestions ?? []);
      setDraftWarnings(data.warnings ?? []);
      setDraftIsGeneric(!!data.isGeneric);
      setDraftGenericWarning(data.genericWarning ?? null);
      if (data.meta?.parseMode) setLlmMode(data.meta.parseMode as "llm" | "heuristic" | "cache");
      setLlmStage(data.meta?.parseMode === "cache" ? "Cache — réutilisé" : data.meta?.parseMode === "llm" ? "Terminé — LLM" : "Terminé — local");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      clearInterval(interval);
      setLlmProgress(100);
      setLlmLoading(false);
      setTimeout(() => {
        setLlmProgress(0);
        setLlmStage("");
      }, 2500);
    }
  }

  async function handleUseDraft() {
    if (!draft) return;
    const d = draft as Record<string, unknown> & { title: string; statement: string; io_spec: string; examples: Array<{ input: string; output: string }>; concepts: string[]; difficulty: number; steps: StepDraft[] };
    setTitle(d.title as string);
    setStatement(d.statement as string);
    setExamples((d.examples as Array<{ input: string; output: string }>)?.map((e) => `${e.input} -> ${e.output}`).join("\n") ?? "");
    setSteps((d.steps as StepDraft[]) ?? steps);
    setActiveTab("manual");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!exerciseMdFile || !stepsJsonFile) {
      setError("Deux fichiers requis: exercise.md et steps.json");
      return;
    }
    setUploadLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("exercise.md", exerciseMdFile);
      form.append("steps.json", stepsJsonFile);
      if (referenceFile) form.append("reference.py", referenceFile);
      const res = await fetch("/api/teacher/exercises/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur upload");
      router.push(`/teacher/exercises/${data.exercise.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Nouvel exercice</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Choisis le mode qui te convient — manuel est le plus rapide à shipper, LLM et upload réutilisent la même vérification Stage A/B.</p>

      <div className="mt-6 flex gap-2 rounded-full bg-zinc-100 p-1 text-sm dark:bg-zinc-800">
        {[
          ["manual", "Manuel"],
          ["llm", "Assisté par IA"],
          ["upload", "Upload 2 fichiers"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as typeof activeTab)}
            className={`flex-1 rounded-full px-3 py-1.5 font-medium transition-colors ${activeTab === key ? "bg-white shadow dark:bg-zinc-900" : "text-zinc-600 dark:text-zinc-400"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "manual" && (
        <form onSubmit={handleManualSubmit} className="mt-6 space-y-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Titre</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} required placeholder="Ex: Somme de deux nombres" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Énoncé (statement)</span>
            <textarea value={statement} onChange={(e) => setStatement(e.target.value)} rows={4} className={textareaCls} required placeholder="Écrire un programme qui..." />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Exemples (une par ligne, format "input -&gt; output")</span>
            <textarea value={examples} onChange={(e) => setExamples(e.target.value)} rows={3} className={`${textareaCls} font-mono`} placeholder="2 3 -> 5" />
          </label>

          <div className="rounded-xl border border-black/10 bg-zinc-50 p-4 dark:border-white/10 dark:bg-zinc-800">
            <h3 className="font-medium text-zinc-900 dark:text-zinc-100">Étapes ({steps.length}) — Step schema vérifié</h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Chaque étape déclare check_type: ast_check (début), function_test, ou io_test (final).</p>
            <div className="mt-3 space-y-2">
              {steps.map((s, idx) => (
                <div key={idx} className="grid gap-2 rounded-lg border border-black/5 bg-white p-3 dark:border-white/10 dark:bg-zinc-900">
                  <input value={s.title} onChange={(e) => setSteps((prev) => prev.map((p, i) => (i === idx ? { ...p, title: e.target.value } : p)))} placeholder="Titre" className={smallInputCls} />
                  <input value={s.goal} onChange={(e) => setSteps((prev) => prev.map((p, i) => (i === idx ? { ...p, goal: e.target.value } : p)))} placeholder="Goal (visible seulement quand étape courante)" className={smallInputCls} />
                  <select value={s.check_type} onChange={(e) => setSteps((prev) => prev.map((p, i) => (i === idx ? { ...p, check_type: e.target.value as StepDraft["check_type"] } : p)))} className={selectCls}>
                    <option value="ast_check">ast_check — début (input, For, If)</option>
                    <option value="io_test">io_test — programme complet (final)</option>
                    <option value="function_test">function_test — fonction helper</option>
                  </select>
                </div>
              ))}
              <button type="button" onClick={() => setSteps((p) => [...p, { title: "Nouvelle étape", goal: "", check_type: "ast_check", ast_check: { must_contain: [] } }])} className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-zinc-900 hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-100">
                + Ajouter une étape
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-zinc-900 dark:text-zinc-100">
            <input type="checkbox" checked={visibility === "public_library"} onChange={(e) => setVisibility(e.target.checked ? "public_library" : "code_only")} className="rounded" />
            Rendre public dans la bibliothèque (sinon code_only — seul le code permet de rejoindre)
          </label>

          <button disabled={loading} type="submit" className="w-full rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {loading ? "Création…" : "Créer l'exercice"}
          </button>
          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        </form>
      )}

      {activeTab === "llm" && (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
            Colle l'énoncé brut, l'IA fait le strict 1-call (isExercise + structuration) + génère une solution de référence et des étapes vérifiées. Tu relis le brouillon avant de publier — jamais d'auto-publish.
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Énoncé brut à structurer</span>
            <textarea value={llmText} onChange={(e) => setLlmText(e.target.value)} rows={8} placeholder="Écrire un programme qui lit deux entiers..." className={textareaCls} />
          </label>
          <button onClick={handleLlmGenerate} disabled={llmLoading || !llmText.trim()} className="w-full rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {llmLoading ? "Génération…" : "Générer le brouillon avec l'IA"}
          </button>
          {(llmLoading || llmProgress > 0) && (
            <div className="space-y-1.5" aria-live="polite" data-testid="llm-progress">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{llmStage || "Analyse…"}</span>
                <span className="tabular-nums text-zinc-500">{Math.round(llmProgress)}%</span>
              </div>
              <div role="progressbar" aria-valuenow={Math.round(llmProgress)} aria-valuemin={0} aria-valuemax={100} className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div className={`h-full rounded-full transition-all duration-300 ${llmMode === "cache" ? "bg-sky-500" : llmMode === "llm" ? "bg-emerald-500" : llmMode === "heuristic" ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, Math.max(0, llmProgress))}%` }} />
              </div>
              {llmMode && <p className="text-xs"><span className={`rounded-full px-2 py-0.5 font-medium ${llmMode === "llm" ? "bg-emerald-50 text-emerald-700" : llmMode === "cache" ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-700"}`}>{llmMode === "llm" ? "LLM" : llmMode === "cache" ? "Cache" : "Local"}</span></p>}
            </div>
          )}
          {suggestions.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950">
              <p className="font-medium text-amber-900 dark:text-amber-100">Exercices similaires déjà existants (suggest-only) :</p>
              <ul className="mt-1 list-disc pl-5 text-amber-800 dark:text-amber-200">
                {suggestions.map((s) => (
                  <li key={s.code}>
                    {s.title} — <span className="font-mono">{s.code}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Tu peux réutiliser l'un d'eux ou continuer à créer le tien.</p>
            </div>
          )}
          {draft && (
            <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Brouillon à relire</h3>
              {(() => {
                const d = draft as {
                  examples?: Array<{ input: string; output: string }>;
                  _genericWarning?: { title: string; body: string; suggestion: { input: string; output: string } | null };
                  genericWarning?: { title: string; body: string; suggestion: { input: string; output: string } | null };
                  warnings?: string[];
                  isGeneric?: boolean;
                  _isGeneric?: boolean;
                };
                const gw = draftGenericWarning ?? (d as { genericWarning?: typeof draftGenericWarning }).genericWarning ?? (d as { _genericWarning?: typeof draftGenericWarning })._genericWarning ?? null;
                const warnList = draftWarnings.length ? draftWarnings : (d as { warnings?: string[] }).warnings ?? [];
                const isGen = draftIsGeneric || d.examples?.[0]?.input === "exemple entrée" || (d as { isGeneric?: boolean }).isGeneric || !!gw;
                if (!isGen && !gw && warnList.length === 0) return null;
                // Clearer, non-technical copy — no `exemple entrée` jargon in the title
                const title = "Il manque un exemple concret";
                const body =
                  gw?.body ??
                  "Ton énoncé ne donne pas d'exemple chiffré. Sans exemple, les tests ne peuvent rien vérifier. Ajoute au moins un couple Entrée → Sortie réaliste.";
                const suggestion = gw?.suggestion;
                return (
                  <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    <p className="font-medium">⚠ {title}</p>
                    <p className="mt-1 leading-5">{body}</p>
                    {suggestion ? (
                      <div className="mt-2 rounded-lg bg-white p-2.5 dark:bg-zinc-900">
                        <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Exemple proposé pour cet exercice :</p>
                        <div className="mt-1.5 grid gap-1 font-mono text-xs">
                          <div className="rounded bg-amber-100 px-2 py-1 dark:bg-zinc-800">
                            <span className="font-medium">Entrée :</span> {suggestion.input.replace(/\n/g, " ⏎ ")}
                          </div>
                          <div className="rounded bg-white px-2 py-1 ring-1 ring-amber-200 dark:bg-zinc-800 dark:ring-amber-900">
                            <span className="font-medium">Sortie attendue :</span> {suggestion.output.replace(/\n/g, " ⏎ ")}
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const exStr = `${suggestion.input} -> ${suggestion.output}`;
                            handleUseDraft();
                            setTimeout(() => setExamples(exStr), 120);
                          }}
                          className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
                        >
                          Utiliser cet exemple →
                        </button>
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Tu pourras le modifier dans l'onglet Manuel avant de créer.</p>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs">Dans l'onglet Manuel, ajoute une ligne `entrée → sortie` (ex: `2 3 → 5`).</p>
                    )}
                    {warnList.length > 0 && warnList[0] !== body && (
                      <ul className="mt-2 list-disc pl-5 text-xs">
                        {warnList.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button onClick={handleUseDraft} className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-amber-800 ring-1 ring-amber-300 hover:bg-amber-100 dark:bg-zinc-900 dark:text-amber-200">
                        Ouvrir dans Manuel →
                      </button>
                      <span className="self-center text-xs text-amber-700 dark:text-amber-300">puis `Créer l'exercice`</span>
                    </div>
                  </div>
                );
              })()}
              {((draft as { steps?: Array<{ title: string }> }).steps?.some((s) => s.title === "Gérer le cas limite") && (draft as { examples?: Array<{ input: string }> }).examples?.[0]?.input?.split("\n").length === 6) ? (
                <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:text-amber-200">
                  Astuce : `Gérer le cas limite` est peu pertinent pour `n=2` fixe — envisage `Calcul TVA (20%)` à la place.
                </div>
              ) : null}
              <p className="mt-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">{(draft as { title?: string }).title as string}</p>
              <details className="mt-2 rounded-xl border border-black/10 bg-zinc-50 dark:border-white/10 dark:bg-zinc-800" open>
                <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">Voir JSON complet du brouillon — {JSON.stringify(draft).length} chars</summary>
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap border-t border-black/5 p-3 text-xs text-zinc-900 dark:border-white/10 dark:text-zinc-100">{JSON.stringify(draft, null, 2)}</pre>
              </details>
              <div className="mt-2 grid gap-2 rounded-lg bg-zinc-50 p-3 text-xs dark:bg-zinc-800">
                <p className="font-medium text-zinc-900 dark:text-zinc-100">Aperçu lisible — vérifie avant de publier</p>
                <p><span className="font-medium">Titre:</span> {(draft as { title?: string }).title as string}</p>
                <p><span className="font-medium">Exemples:</span> {(draft as { examples?: Array<{ input: string; output: string }> }).examples?.map((e) => `${e.input} → ${e.output}`).join(" | ") || "—"}</p>
                <p><span className="font-medium">Étapes:</span> {(draft as { steps?: Array<{ title: string }> }).steps?.map((s) => s.title).join(" → ") || "—"}</p>
                <p><span className="font-medium">Tests visibles:</span> {(draft as { visibleTests?: unknown[] }).visibleTests?.length ?? 0} · <span className="font-medium">cachés:</span> {(draft as { hiddenTests?: unknown[] }).hiddenTests?.length ?? 0}</p>
              </div>
              <button onClick={handleUseDraft} className="mt-3 w-full rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900">
                Utiliser ce brouillon dans l'onglet Manuel →
              </button>
            </div>
          )}
          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        </div>
      )}

      {activeTab === "upload" && (
        <form onSubmit={handleUpload} className="mt-6 space-y-4">
          <div className="rounded-xl border border-black/10 bg-zinc-50 p-4 text-sm dark:border-white/10 dark:bg-zinc-800">
            <p className="font-medium text-zinc-900 dark:text-zinc-100">Format 2 fichiers (addendum §5)</p>
            <pre className="mt-2 whitespace-pre-wrap text-xs text-zinc-600 dark:text-zinc-400">
              {`exercise.md
---
title: Somme
language: python
concepts: [loops]
difficulty: 2
---
# Statement
...
## Examples
- input: 2 3
  output: 5

steps.json
[
  {"order":1,"title":"Lire","goal":"...","check_type":"ast_check","ast_check":{"must_contain":["input"]}}
]`}
            </pre>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">exercise.md</span>
            <input type="file" accept=".md" onChange={(e) => setExerciseMdFile(e.target.files?.[0] ?? null)} className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900 file:mr-2 file:rounded-full file:border-0 file:bg-zinc-900 file:px-3 file:py-1 file:text-xs file:text-white dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-100" required />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">steps.json</span>
            <input type="file" accept=".json" onChange={(e) => setStepsJsonFile(e.target.files?.[0] ?? null)} className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900 file:mr-2 file:rounded-full file:border-0 file:bg-zinc-900 file:px-3 file:py-1 file:text-xs file:text-white dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-100" required />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">reference.py (optionnel, pour vérification)</span>
            <input type="file" accept=".py" onChange={(e) => setReferenceFile(e.target.files?.[0] ?? null)} className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900 file:mr-2 file:rounded-full file:border-0 file:bg-zinc-900 file:px-3 file:py-1 file:text-xs file:text-white dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-100" />
          </label>
          <button disabled={uploadLoading} type="submit" className="w-full rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {uploadLoading ? "Upload…" : "Importer"}
          </button>
          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        </form>
      )}
    </div>
  );
}
