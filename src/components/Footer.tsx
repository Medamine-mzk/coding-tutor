"use client";
import { useI18n } from "@/lib/i18n";

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-black/5 bg-zinc-50 dark:border-white/10 dark:bg-zinc-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-zinc-600 dark:text-zinc-400 sm:flex-row sm:justify-between sm:px-6">
        <span>{t("footer.offline")} · {t("footer.privacy")}</span>
        <span>Made for Tunisia · Python first</span>
      </div>
    </footer>
  );
}
