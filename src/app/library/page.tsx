"use client";
import { useI18n } from "@/lib/i18n";
import Link from "next/link";

export default function LibraryPage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold">{t("nav.library")}</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        ~20 Python exercises (fr/ar/en) land in Ticket 10 — loops, conditionals, lists, functions, recursion. Target: lycee basics plus Bac Informatique seed.
      </p>
      <div className="mt-6 rounded-2xl border border-dashed border-black/15 bg-zinc-50 p-8 text-center dark:border-white/15 dark:bg-zinc-900">
        <p className="text-sm text-zinc-500">Library scaffold placeholder — pick an exercise will route to workspace in Ticket 03/07.</p>
        <Link href="/#start" className="mt-4 inline-flex rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-900">
          {t("landing.cta")}
        </Link>
      </div>
    </div>
  );
}
