"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewExercisePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"manual" | "llm" | "upload">("manual");

  // Manual — énoncé + exemples + correction (les indices sont auto-générés)
  const [title, setTitle] = useState("Exercice exemple — somme");
  const [statement, setStatement] = useState("Écrire un programme qui lit deux entiers et affiche leur somme.\nInput : 2 3\nOutput : 5");
  const [examples, setExamples] = useState("2 3 -> 5\n0 0 -> 0");
  const [reference, setReference] = useState('a = int(input())\nb = int(input())\nprint(a + b)');
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

  // Upload — exercise.md + reference.py (les indices sont auto-générés)
  const [exerciseMdFile, setExerciseMdFile] = useState<File | null>(null);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);

  const inputCls = "rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:outline-none dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-400";
  const textareaCls = "rounded-xl border border-black/10 bg-white p-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:outline-none dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-400";
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
          hidden_tests: [],
          visible_tests: exs.slice(0, 2).map((eg, i) => ({ id: `t_vis_${i}`, input: eg.input, stdin: eg.input.split(/[ \n]+/), expected: eg.output, kind: "stdout", hidden: false })),
          visibility,
          reference_solution: reference.trim() || null,
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
          let doneReferenceSolution: string | null = null;
          let doneCommentedReference: string | null = null;
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
                const maybeRef = (data as { referenceSolution?: unknown }).referenceSolution;
                const maybeCom = (data as { commentedReference?: unknown }).commentedReference;
                if (typeof maybeRef === "string") doneReferenceSolution = maybeRef;
                if (typeof maybeCom === "string") doneCommentedReference = maybeCom;
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
            setDraft({ ...doneDraft, _meta: doneMeta, referenceSolution: doneReferenceSolution, commentedReference: doneCommentedReference } as Record<string, unknown>);
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
      if (!res.ok) {
        if (res.status === 401) {
          setError("Session expirée — reconnecte-toi");
          setTimeout(() => (window.location.href = "/teacher/login?next=/teacher/exercises/new&reason=session_expired"), 1200);
          throw new Error("Session expirée — redirige vers /teacher/login");
        }
        throw new Error(data.error ?? "Erreur génération");
      }
      if (data.isExercise === false) throw new Error(data.clarification ?? "Non exercice");
      setDraft({ ...data.draft, _meta: data.meta, _warnings: data.warnings, _isGeneric: data.isGeneric, _genericWarning: data.genericWarning, referenceSolution: data.referenceSolution ?? null, commentedReference: data.commentedReference ?? null } as Record<string, unknown>);
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
    const d = draft as Record<string, unknown> & { title: string; statement: string; io_spec: string; examples: Array<{ input: string; output: string }>; concepts: string[]; difficulty: number; referenceSolution?: string };
    setTitle(d.title as string);
    setStatement(d.statement as string);
    setExamples((d.examples as Array<{ input: string; output: string }>)?.map((e) => `${e.input} -> ${e.output}`).join("\n") ?? "");
    if (typeof d.referenceSolution === "string" && d.referenceSolution.trim()) setReference(d.referenceSolution);
    setActiveTab("manual");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!exerciseMdFile) {
      setError("Fichier requis: exercise.md (reference.py recommandé pour les indices)");
      return;
    }
    setUploadLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("exercise.md", exerciseMdFile);
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
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Énoncé + correction uniquement — les indices sont générés automatiquement (commentaires FR révélés niveau par niveau).</p>

      <div className="mt-6 flex gap-2 rounded-full bg-zinc-100 p-1 text-sm dark:bg-zinc-800">
        {[
          ["manual", "Manuel"],
          ["llm", "Assisté par IA"],
          ["upload", "Upload énoncé + correction"],
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

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Correction — solution de référence Python (les indices sont auto-générés)</span>
            <textarea value={reference} onChange={(e) => setReference(e.target.value)} rows={6} className={`${textareaCls} font-mono`} placeholder={'a = int(input())\nb = int(input())\nprint(a + b)'} />
            <span className="text-xs text-zinc-600 dark:text-zinc-400">Chaque ligne sera commentée en français et révélée aux élèves niveau par niveau (1→5).</span>
          </label>

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
            Colle l'énoncé brut, l'IA structure l'exercice + génère une solution de référence commentée. Tu relis le brouillon avant de publier — jamais d'auto-publish.
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
                <span className="tabular-nums text-zinc-600">{Math.round(llmProgress)}%</span>
              </div>
              <div role="progressbar" aria-valuenow={Math.round(llmProgress)} aria-valuemin={0} aria-valuemax={100} className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div className={`h-full rounded-full transition-all duration-300 ${llmMode === "cache" ? "bg-sky-500" : llmMode === "llm" ? "bg-emerald-500" : llmMode === "heuristic" ? "bg-amber-600" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, Math.max(0, llmProgress))}%` }} />
              </div>
              {llmMode && <p className="text-xs"><span className={`rounded-full px-2 py-0.5 font-medium ${llmMode === "llm" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : llmMode === "cache" ? "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"}`}>{llmMode === "llm" ? "LLM" : llmMode === "cache" ? "Cache" : "Local"}</span></p>}
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
              {(draft as { commentedReference?: string }).commentedReference ? (
                <details className="mt-2 rounded-xl border border-black/10 bg-zinc-50 dark:border-white/10 dark:bg-zinc-800">
                  <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">Voir la correction commentée (indices élèves)</summary>
                  <pre className="max-h-96 overflow-auto whitespace-pre-wrap border-t border-black/5 p-3 font-mono text-xs text-zinc-900 dark:border-white/10 dark:text-zinc-100">{(draft as { commentedReference?: string }).commentedReference as string}</pre>
                </details>
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
                <p><span className="font-medium">Correction:</span> {(draft as { referenceSolution?: string }).referenceSolution ? `${((draft as { referenceSolution?: string }).referenceSolution as string).split("\n").length} lignes ✓` : "—"}</p>
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
            <p className="font-medium text-zinc-900 dark:text-zinc-100">2 fichiers : énoncé + correction (les indices sont auto-générés)</p>
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
- input: 2
  3
  output: 5

reference.py
a = int(input())
b = int(input())
print(a + b)`}
            </pre>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">exercise.md</span>
            <input type="file" accept=".md" onChange={(e) => setExerciseMdFile(e.target.files?.[0] ?? null)} className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900 file:mr-2 file:rounded-full file:border-0 file:bg-zinc-900 file:px-3 file:py-1 file:text-xs file:text-white dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-100" required />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">reference.py (correction — génère les indices)</span>
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
