"use client";

import { useState } from "react";
import type { Exercise } from "@/lib/exercise/types";
import { useI18n } from "@/lib/i18n";

type Props = {
  exercise: Exercise;
  onConfirm: (ex: Exercise) => void;
  onCancel: () => void;
};

export function ExerciseConfirm({ exercise: initial, onConfirm, onCancel }: Props) {
  const { locale, dir } = useI18n();
  const [ex, setEx] = useState<Exercise>(initial);
  const [saving, setSaving] = useState(false);

  function update<K extends keyof Exercise>(key: K, value: Exercise[K]) {
    setEx((prev) => ({ ...prev, [key]: value }));
  }

  function updateExample(idx: number, field: "input" | "output", val: string) {
    const next = ex.examples.map((e, i) => (i === idx ? { ...e, [field]: val } : e));
    update("examples", next);
  }

  function addExample() {
    update("examples", [...ex.examples, { input: "", output: "" }]);
  }

  function removeExample(idx: number) {
    update("examples", ex.examples.filter((_, i) => i !== idx));
  }

  function handleConfirm() {
    setSaving(true);
    try {
      const payload = JSON.stringify(ex);
      localStorage.setItem("currentExercise", payload);
      localStorage.setItem("currentExerciseId", ex.id);
    } catch {}
    onConfirm(ex);
  }

  return (
    <div role="form" aria-label={locale === "ar" ? "تأكيد التمرين" : locale === "en" ? "Confirm exercise" : "Confirmer l'exercice"} className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900" data-testid="confirm-card" dir={dir}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">
            {locale === "ar" ? "تأكيد التمرين" : locale === "en" ? "Confirm exercise" : "Confirme l'exercice"}
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {locale === "ar" ? "تحقق وعدّل قبل البدء. العنوان والتفاصيل مرئية فقط، الحل لا يذهب للمتصفح أبدا." : locale === "en" ? "Check and edit before starting. Titles only — the reference solution never reaches the browser." : "Vérifie et corrige avant de commencer. Titres seulement — la solution de référence ne part jamais vers le navigateur."}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-600 px-3 py-1 text-xs font-medium text-white">{ex.language}</span>
      </div>

      <div className="mt-6 grid gap-6">
        {/* Title */}
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Titre / Title / العنوان</span>
          <input
            value={ex.title}
            onChange={(e) => update("title", e.target.value)}
            className="rounded-xl border border-black/10 bg-zinc-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-800"
            data-testid="input-title"
          />
        </label>

        {/* Statement */}
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Énoncé / Statement / البيان</span>
          <textarea
            value={ex.statement}
            onChange={(e) => update("statement", e.target.value)}
            rows={6}
            className="rounded-xl border border-black/10 bg-zinc-50 p-3 text-sm dark:border-white/10 dark:bg-zinc-800"
            data-testid="input-statement"
            dir={dir}
          />
        </label>

        {/* ioSpec */}
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Entrées / Sorties · Input / Output · المدخلات/المخرجات</span>
          <textarea
            value={ex.ioSpec}
            onChange={(e) => update("ioSpec", e.target.value)}
            rows={3}
            className="rounded-xl border border-black/10 bg-zinc-50 p-3 text-sm dark:border-white/10 dark:bg-zinc-800"
            data-testid="input-iospec"
          />
        </label>

        {/* Constraints */}
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Contraintes · Constraints</span>
          <input
            value={ex.constraints.join(" | ")}
            onChange={(e) => update("constraints", e.target.value.split("|").map((s) => s.trim()).filter(Boolean))}
            placeholder="-1000 ≤ n ≤ 1000"
            className="rounded-xl border border-black/10 bg-zinc-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-800"
            data-testid="input-constraints"
          />
        </label>

        {/* Examples */}
        <div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Exemples · Examples</span>
            <button type="button" onClick={addExample} className="rounded-full border border-black/10 px-3 py-1 text-xs hover:bg-zinc-50 dark:border-white/15">+ Ajouter</button>
          </div>
          <div className="mt-2 space-y-2">
            {ex.examples.map((eg, idx) => (
              <div key={idx} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-500">Input {idx + 1}</span>
                  <input value={eg.input} onChange={(e) => updateExample(idx, "input", e.target.value)} className="rounded-lg border border-black/10 bg-zinc-50 px-2 py-1.5 font-mono text-sm dark:border-white/10 dark:bg-zinc-800" data-testid={`example-input-${idx}`} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-500">Output {idx + 1}</span>
                  <input value={eg.output} onChange={(e) => updateExample(idx, "output", e.target.value)} className="rounded-lg border border-black/10 bg-zinc-50 px-2 py-1.5 font-mono text-sm dark:border-white/10 dark:bg-zinc-800" data-testid={`example-output-${idx}`} />
                </label>
                <button type="button" onClick={() => removeExample(idx)} aria-label="Remove example" className="h-9 w-9 rounded-full border border-black/10 hover:bg-red-50 dark:border-white/15 dark:hover:bg-red-950">×</button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-zinc-500">Tests visibles issus des exemples · Visible tests from examples</p>
        </div>

        {/* Concepts & Difficulty & Locale */}
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Difficulté · Difficulty</span>
            <select value={ex.difficulty} onChange={(e) => update("difficulty", Number(e.target.value) as Exercise["difficulty"])} className="rounded-xl border border-black/10 bg-zinc-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-800" data-testid="select-difficulty">
              {[1,2,3,4,5].map((d) => <option key={d} value={d}>{d} — {d===1?"Facile":d===5?"Difficile":"Moyen"}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Langue tuteur</span>
            <select value={ex.uiLocale} onChange={(e) => update("uiLocale", e.target.value as Exercise["uiLocale"])} className="rounded-xl border border-black/10 bg-zinc-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-800" data-testid="select-locale">
              <option value="fr">Français</option>
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Concepts</span>
            <input value={ex.concepts.join(", ")} onChange={(e) => update("concepts", e.target.value.split(",").map((s)=>s.trim()).filter(Boolean) as Exercise["concepts"])} placeholder="loops, conditionals" className="rounded-xl border border-black/10 bg-zinc-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-800" data-testid="input-concepts" />
          </label>
        </div>

        <div className="rounded-xl bg-zinc-50 p-3 text-xs leading-5 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
          <strong>Milestones {ex.milestones.length}</strong> · {ex.milestones.map((m)=>m.title).join(" → ")} <br />
          <strong>Visible tests {ex.visibleTests.length}</strong> · {ex.visibleTests.map((t)=>`${t.id}:${t.expected}`).join(", ") || "—"} <br />
          <strong>Hidden tests {ex.hiddenTests?.length ?? 0}</strong> · {ex.hiddenTests?.map((t)=>`${t.id} (${t.category ?? "hidden"})`).join(", ") || "—"} <br />
          <span className="text-zinc-500">Les tests cachés ne révèlent jamais l&apos;entrée/sortie au-delà de la catégorie — only category visible.</span>
          <br />Source: {ex.source} · id {ex.id}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button onClick={handleConfirm} disabled={saving} title={!ex.title.trim() || !ex.statement.trim() ? "Titre/énoncé vide" : undefined} data-testid="btn-confirm" className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-6 font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900">
          {saving ? "…" : locale === "ar" ? "ابدأ البرمجة →" : locale === "en" ? "Start coding →" : "Commencer à coder →"}
        </button>
        <button onClick={onCancel} data-testid="btn-cancel" className="inline-flex h-11 items-center justify-center rounded-full border border-black/10 px-6 font-medium hover:bg-zinc-50 dark:border-white/15 dark:hover:bg-zinc-800">
          {locale === "ar" ? "إلغاء" : locale === "en" ? "Cancel" : "Annuler"}
        </button>
      </div>
    </div>
  );
}
