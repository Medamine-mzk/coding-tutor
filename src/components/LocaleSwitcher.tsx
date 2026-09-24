"use client";

import { locales, localeNames, type Locale } from "@/i18n/config";
import { useI18n } from "@/lib/i18n";

export function LocaleSwitcher() {
  const { locale, setLocale } = useI18n();
  return (
    <div className="flex items-center gap-1 rounded-full border border-black/10 bg-white p-1 text-sm dark:border-white/15 dark:bg-zinc-900" role="group" aria-label="Language">
      {locales.map((l) => (
        <button
          key={l}
          onClick={() => setLocale(l as Locale)}
          aria-pressed={locale === l}
          className={
            "rounded-full px-3 py-1 transition-colors " +
            (locale === l
              ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
              : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800")
          }
        >
          {localeNames[l as Locale]}
        </button>
      ))}
    </div>
  );
}
