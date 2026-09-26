"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { defaultLocale, localeDir, type Locale, locales } from "@/i18n/config";
import fr from "@/i18n/messages/fr.json";
import en from "@/i18n/messages/en.json";
import ar from "@/i18n/messages/ar.json";

const messages: Record<Locale, typeof fr> = { fr, en: en as typeof fr, ar: ar as typeof fr };

type I18nContextValue = {
  locale: Locale;
  dir: "ltr" | "rtl";
  t: (path: string) => string;
  setLocale: (l: Locale) => void;
  messages: typeof fr;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function getNested(obj: unknown, path: string): string | undefined {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else return undefined;
  }
  return typeof cur === "string" ? cur : undefined;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("locale") as Locale | null;
    if (saved && (locales as readonly string[]).includes(saved)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from storage once
      setLocaleState(saved);
      return;
    }
    const nav = navigator.language.slice(0, 2).toLowerCase();
    if ((locales as readonly string[]).includes(nav)) {
      setLocaleState(nav as Locale);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.lang = locale;
    document.documentElement.dir = localeDir[locale];
    localStorage.setItem("locale", locale);
  }, [locale, mounted]);

  const dir = localeDir[locale];
  const msgs = messages[locale] ?? messages[defaultLocale];

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    dir,
    messages: msgs,
    setLocale: setLocaleState,
    t: (path: string) => getNested(msgs, path) ?? path,
  }), [locale, dir, msgs]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
