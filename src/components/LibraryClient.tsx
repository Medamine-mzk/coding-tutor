"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import type { Exercise } from "@/lib/exercise/types";
import { LIBRARY_EXERCISES } from "@/lib/exercise/library";

export function LibraryClient() {
  const { locale, dir } = useI18n();
  const router = useRouter();
  const [filterLocale, setFilterLocale] = useState<"all" | "fr" | "ar" | "en">("all");
  const [filterDiff, setFilterDiff] = useState<"all" | "1" | "2" | "3" | "4">("all");
  const [filterConcept, setFilterConcept] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return LIBRARY_EXERCISES.filter((ex) => {
      if (filterLocale !== "all" && ex.uiLocale !== filterLocale) return false;
      if (filterDiff !== "all" && String(ex.difficulty) !== filterDiff) return false;
      if (filterConcept !== "all" && !ex.concepts.includes(filterConcept as Exercise["concepts"][number])) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!ex.title.toLowerCase().includes(q) && !ex.statement.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [filterLocale, filterDiff, filterConcept, search]);

  function handlePick(ex: Exercise) {
    try {
      localStorage.setItem("currentExercise", JSON.stringify(ex));
      localStorage.setItem("currentExerciseId", ex.id);
    } catch {}
    router.push(`/workspace?exerciseId=${encodeURIComponent(ex.id)}`);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6" dir={dir}>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">
          {locale === "ar" ? "المكتبة" : locale === "en" ? "Library" : "Bibliothèque"} · {LIBRARY_EXERCISES.length} exercices
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {locale === "ar"
            ? "20 تمرينا ببايثون — من الأساسيات إلى التراجع، مع أمثلة من الباكالوريا."
            : locale === "en"
              ? "20 Python exercises — from basics to recursion, including Bac seeds."
              : "20 exercices Python — des bases à la récursion, dont des graines Bac Informatique."}
        </p>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={locale === "ar" ? "بحث..." : locale === "en" ? "Search..." : "Rechercher..."}
          className="min-w-[200px] flex-1 rounded-full border border-black/10 bg-white px-4 py-2 text-sm dark:border-white/10 dark:bg-zinc-900"
          data-testid="library-search"
        />
        <select value={filterLocale} onChange={(e) => setFilterLocale(e.target.value as typeof filterLocale)} className="rounded-full border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-900" data-testid="filter-locale">
          <option value="all">{locale === "ar" ? "كل اللغات" : locale === "en" ? "All languages" : "Toutes langues"}</option>
          <option value="fr">Français</option>
          <option value="ar">العربية</option>
          <option value="en">English</option>
        </select>
        <select value={filterDiff} onChange={(e) => setFilterDiff(e.target.value as typeof filterDiff)} className="rounded-full border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-900" data-testid="filter-diff">
          <option value="all">{locale === "ar" ? "كل المستويات" : locale === "en" ? "All levels" : "Tous niveaux"}</option>
          <option value="1">1 — {locale === "ar" ? "سهل" : locale === "en" ? "Easy" : "Facile"}</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
        </select>
        <select value={filterConcept} onChange={(e) => setFilterConcept(e.target.value)} className="rounded-full border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-900" data-testid="filter-concept">
          <option value="all">{locale === "ar" ? "كل المفاهيم" : locale === "en" ? "All concepts" : "Tous concepts"}</option>
          <option value="loops">loops</option>
          <option value="conditionals">conditionals</option>
          <option value="lists">lists</option>
          <option value="functions">functions</option>
          <option value="recursion">recursion</option>
          <option value="strings">strings</option>
          <option value="dictionaries">dictionaries</option>
          <option value="math">math</option>
        </select>
      </div>

      <p className="mt-3 text-xs text-zinc-500" data-testid="library-count">
        {filtered.length} / {LIBRARY_EXERCISES.length} {locale === "ar" ? "تمرين" : locale === "en" ? "exercises" : "exercices"}
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="library-grid">
        {filtered.map((ex) => (
          <div key={ex.id} className="flex flex-col rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900" data-testid={`lib-card-${ex.id}`}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold leading-5">{ex.title}</h3>
              <span className="shrink-0 rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white dark:bg-white dark:text-zinc-900">{ex.difficulty}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">{ex.statement.slice(0, 120)}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {ex.concepts.map((c) => (
                <span key={c} className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800">
                  {c}
                </span>
              ))}
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{ex.uiLocale}</span>
            </div>
            <div className="mt-3 rounded-xl bg-zinc-50 p-2 text-xs dark:bg-zinc-800">
              <p className="font-medium">Ex: {ex.examples[0]?.input ?? "—"} → {ex.examples[0]?.output ?? "—"}</p>
              <p className="mt-1 text-zinc-500">{ex.milestones.length} étapes · {ex.visibleTests.length} tests visibles + {ex.hiddenTests.length} cachés</p>
            </div>
            <button onClick={() => handlePick(ex)} className="mt-3 inline-flex items-center justify-center rounded-full bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700" data-testid={`pick-${ex.id}`}>
              {locale === "ar" ? "ابدأ" : locale === "en" ? "Start" : "Commencer"} →
            </button>
          </div>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="mt-6 text-center text-sm text-zinc-500" data-testid="no-results">
          {locale === "ar" ? "لا نتائج" : locale === "en" ? "No results" : "Aucun résultat"}
        </p>
      ) : null}
    </div>
  );
}
