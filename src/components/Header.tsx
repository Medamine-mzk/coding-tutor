"use client";

import Link from "next/link";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { useI18n } from "@/lib/i18n";
import { useEffect, useState } from "react";

export function Header() {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- for theme locale hydration
    setMounted(true);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("theme") as "light" | "dark" | null;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial = saved ?? (prefersDark ? "dark" : "light");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time theme hydrate
    setTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem("theme", next);
  }

  // Avoid hydration mismatch for theme-dependent icon/label
  const isDark = mounted && theme === "dark";

  return (
    <header className="sticky top-0 z-30 border-b border-black/5 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/70 dark:border-white/10 dark:bg-zinc-950/80" role="banner">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" aria-label="Mchi Nekteb — home" className="flex items-center gap-3 rounded-lg p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-white" suppressHydrationWarning>
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900 text-sm font-bold text-white dark:bg-white dark:text-zinc-900" aria-hidden suppressHydrationWarning>
            {">_"}
          </span>
          <span className="flex flex-col leading-none" suppressHydrationWarning>
            <span className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-white" suppressHydrationWarning>
              {t("common.appName")}
            </span>
            <span className="text-xs text-zinc-600 dark:text-zinc-400" suppressHydrationWarning>
              {t("common.appSubtitle")}
            </span>
          </span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm sm:flex" aria-label="Primary" suppressHydrationWarning>
          <Link href="/" suppressHydrationWarning className="rounded px-2 py-1 text-zinc-700 underline-offset-4 hover:text-zinc-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:text-zinc-300 dark:hover:text-white dark:focus-visible:ring-white">
            <span suppressHydrationWarning>{t("nav.home")}</span>
          </Link>
          <Link href="/teacher" suppressHydrationWarning className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900">
            <span suppressHydrationWarning>{t("nav.teacher")}</span>
          </Link>
          <Link href="/student/join" suppressHydrationWarning className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 ring-1 ring-sky-200 hover:bg-sky-100 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-900">
            <span suppressHydrationWarning>{t("nav.studentJoin")}</span>
          </Link>
          <Link href="/library" suppressHydrationWarning className="rounded px-2 py-1 text-zinc-700 underline-offset-4 hover:text-zinc-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:text-zinc-300 dark:hover:text-white dark:focus-visible:ring-white">
            <span suppressHydrationWarning>{t("nav.library")}</span>
          </Link>
        </nav>
        <div className="flex items-center gap-2" suppressHydrationWarning>
          <span suppressHydrationWarning>
            <LocaleSwitcher />
          </span>
          <button
            onClick={toggleTheme}
            aria-label={isDark ? "Activer le thème clair" : "Activer le thème sombre"}
            aria-pressed={isDark}
            suppressHydrationWarning
            className="inline-flex min-h-[36px] min-w-[44px] items-center justify-center rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:border-white/15 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:focus-visible:ring-white"
            title={t(isDark ? "common.light" : "common.dark")}
          >
            <span aria-hidden suppressHydrationWarning>
              {isDark ? "☀️" : "🌙"}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
