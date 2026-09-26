"use client";

import { useState, useRef } from "react";
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

  async function handleSubmit(e: React.FormEvent) {
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

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">Nouvel exercice — manuel</h1>
      <p className="mt-1 text-sm text-zinc-600">Le plus simple à shipper d'abord : pas de LLM, pas d'upload. Produit le même objet Exercise + Step[] déjà typé.</p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Titre</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-xl border border-black/10 bg-zinc-50 px-3 py-2 text-sm" required />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Énoncé (statement)</span>
          <textarea value={statement} onChange={(e) => setStatement(e.target.value)} rows={4} className="rounded-xl border border-black/10 bg-zinc-50 p-3 text-sm" required />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Exemples (une par ligne, format "input -&gt; output")</span>
          <textarea value={examples} onChange={(e) => setExamples(e.target.value)} rows={3} className="rounded-xl border border-black/10 bg-zinc-50 p-3 font-mono text-sm" placeholder="2 3 -> 5" />
        </label>

        <div className="rounded-xl border border-black/10 bg-zinc-50 p-4 dark:bg-zinc-800">
          <h3 className="font-medium">Étapes ({steps.length}) — Step schema vérifié</h3>
          <p className="mt-1 text-xs text-zinc-500">Chaque étape déclare check_type: ast_check (début), function_test, ou io_test (final). Modifiez les titres/goals, le type sera validé.</p>
          <div className="mt-3 space-y-2">
            {steps.map((s, idx) => (
              <div key={idx} className="grid gap-2 rounded-lg border border-black/5 bg-white p-3 dark:bg-zinc-900">
                <input value={s.title} onChange={(e) => setSteps((prev) => prev.map((p, i) => (i === idx ? { ...p, title: e.target.value } : p)))} placeholder="Titre" className="rounded-lg border border-black/10 px-2 py-1 text-sm" />
                <input value={s.goal} onChange={(e) => setSteps((prev) => prev.map((p, i) => (i === idx ? { ...p, goal: e.target.value } : p)))} placeholder="Goal (visible seulement quand étape courante)" className="rounded-lg border border-black/10 px-2 py-1 text-sm" />
                <select value={s.check_type} onChange={(e) => setSteps((prev) => prev.map((p, i) => (i === idx ? { ...p, check_type: e.target.value as StepDraft["check_type"] } : p)))} className="rounded-lg border border-black/10 px-2 py-1 text-xs">
                  <option value="ast_check">ast_check — début (input, For, If)</option>
                  <option value="io_test">io_test — programme complet (final)</option>
                  <option value="function_test">function_test — fonction helper</option>
                </select>
              </div>
            ))}
            <button type="button" onClick={() => setSteps((p) => [...p, { title: "Nouvelle étape", goal: "", check_type: "ast_check", ast_check: { must_contain: [] } }])} className="rounded-full border border-black/10 px-3 py-1 text-xs">
              + Ajouter une étape
            </button>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={visibility === "public_library"} onChange={(e) => setVisibility(e.target.checked ? "public_library" : "code_only")} />
          Rendre public dans la bibliothèque (sinon code_only — seul le code permet de rejoindre)
        </label>

        <button disabled={loading} type="submit" className="w-full rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {loading ? "Création…" : "Créer l'exercice"}
        </button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </form>
    </div>
  );
}
