"use client";

import { useI18n } from "@/lib/i18n";
import { useState } from "react";
import Link from "next/link";

export function LandingClient() {
  const { t, locale, dir } = useI18n();
  const [exerciseText, setExerciseText] = useState("");

  return (
    <div className="flex flex-1 flex-col">
      {/* Hero */}
      <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
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
              <a href="#start" className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-6 font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100">
                {t("landing.cta")} →
              </a>
              <Link href="/library" className="inline-flex h-11 items-center justify-center rounded-full border border-black/10 px-6 font-medium hover:bg-zinc-50 dark:border-white/15 dark:hover:bg-zinc-900">
                {t("landing.library")}
              </Link>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-500">{t("landing.principles")}</p>
          </div>

          {/* Quick intake card */}
          <div id="start" className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
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
              placeholder={t("landing.pastePlaceholder")}
              rows={8}
              className="mt-4 w-full resize-none rounded-xl border border-black/10 bg-zinc-50 p-4 text-sm placeholder:text-zinc-400 focus:border-zinc-300 focus:bg-white focus:outline-none dark:border-white/10 dark:bg-zinc-800 dark:placeholder:text-zinc-500 dark:focus:border-zinc-700 dark:focus:bg-zinc-900"
              dir={dir}
            />
            <div className="mt-4 flex gap-3">
              <button
                disabled={!exerciseText.trim()}
                className="flex-1 rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:disabled:bg-zinc-700"
                onClick={() => {
                  // Ticket 03 will wire to /api/exercise/parse
                  alert(exerciseText.slice(0, 200));
                }}
              >
                {t("landing.choosePython")}
              </button>
            </div>
            <p className="mt-3 text-center text-xs text-zinc-500">
              PDF, image, docx · {locale === "fr" ? "bientôt" : locale === "ar" ? "قريبا" : "soon"} · 5 MB max
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
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

      {/* Coming soon strip */}
      <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <strong>Scaffold v0.1</strong> — IDE + runner (Ticket 02) and exercise intake (Ticket 03) land next. This landing is responsive, trilingual, RTL-correct, and Lighthouse-ready.
        </div>
      </section>
    </div>
  );
}
