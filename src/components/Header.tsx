"use client";

import Link from "next/link";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { useI18n } from "@/lib/i18n";
import { useEffect, useState } from "react";

export function Header() {
  const { t } = useI18n();
  const [theme, setTheme] = useState<"light" | "dark">("light");

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

  return (
    <header className="sticky top-0 z-30 border-b border-black/5 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-zinc-950/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900 text-sm font-bold text-white dark:bg-white dark:text-zinc-900" aria-hidden>
            {">_"}
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-sm font-semibold tracking-tight">{t("common.appName")}</span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{t("common.appSubtitle")}</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm sm:flex" aria-label="Primary">
          <Link href="/" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white">{t("nav.home")}</Link>
          <Link href="/#how" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white">{t("nav.library")}</Link>
        </nav>
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-white/15 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            title={t(theme === "dark" ? "common.light" : "common.dark")}
          >
            <span aria-hidden>{theme === "dark" ? "☀️" : "🌙"}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
