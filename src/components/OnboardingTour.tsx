"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

export const ONBOARDING_SEEN_KEY = "onboarding_seen_v1";

type Step = {
  /** data-testid de l'élément à surligner */
  target: string;
  /** onglet mobile à activer pour rendre la cible visible */
  tab: "exercise" | "editor" | "tutor";
  titleKey: string;
  bodyKey: string;
};

const STEPS: Step[] = [
  { target: "code-editor", tab: "editor", titleKey: "onboarding.step1Title", bodyKey: "onboarding.step1Body" },
  { target: "run-btn", tab: "editor", titleKey: "onboarding.step2Title", bodyKey: "onboarding.step2Body" },
  { target: "stdin-input", tab: "editor", titleKey: "onboarding.step3Title", bodyKey: "onboarding.step3Body" },
  { target: "console-panel", tab: "editor", titleKey: "onboarding.step4Title", bodyKey: "onboarding.step4Body" },
  { target: "tests-btn", tab: "editor", titleKey: "onboarding.step5Title", bodyKey: "onboarding.step5Body" },
  { target: "request-hint", tab: "exercise", titleKey: "onboarding.step6Title", bodyKey: "onboarding.step6Body" },
];

type Rect = { top: number; left: number; width: number; height: number };

export function OnboardingTour({ onTab, onDone }: { onTab: (tab: Step["tab"]) => void; onDone: () => void }) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  const measure = useCallback((testid: string): Rect | null => {
    const el = document.querySelector(`[data-testid="${testid}"]`);
    if (!el) return null;
    // Élément masqué par CSS (ex. onglets mobiles sur desktop) : on saute l'étape.
    // On teste display plutôt que les dimensions (jsdom retourne 0×0 partout).
    try {
      if (window.getComputedStyle(el as Element).display === "none") return null;
    } catch {}
    const r = (el as HTMLElement).getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  }, []);

  // Positionne le spotlight sur la cible (saute les étapes sans cible visible).
  // Scroll instantané + mesure synchrone : le rectangle est toujours exact,
  // jamais dessiné à l'ancienne position (pas de timeout, pas de "nearest").
  useLayoutEffect(() => {
    let idx = step;
    onTab(STEPS[idx].tab);
    let r = measure(STEPS[idx].target);
    while (!r && idx < STEPS.length - 1) {
      idx += 1;
      onTab(STEPS[idx].tab);
      r = measure(STEPS[idx].target);
    }
    if (!r) {
      onDone();
      return;
    }
    if (idx !== step) {
      setStep(idx);
      return;
    }
    const el = document.querySelector(`[data-testid="${STEPS[idx].target}"]`) as HTMLElement | null;
    try {
      // Centre toujours la cible (pas seulement si invisible) ; instantané
      // pour que la mesure suivante soit synchrone et exacte.
      el?.scrollIntoView?.({ block: "center", behavior: "instant" });
    } catch {}
    const r2 = measure(STEPS[idx].target);
    setRect(r2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Re-mesure au resize/scroll (le spotlight suit la cible).
  useEffect(() => {
    const onMove = () => {
      const r = measure(STEPS[step].target);
      if (r) setRect(r);
    };
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [step, measure]);

  const finish = () => {
    try {
      localStorage.setItem(ONBOARDING_SEEN_KEY, "1");
    } catch {}
    onDone();
  };

  const isLast = step === STEPS.length - 1;
  // Tooltip toujours dans l'écran : sous la cible si elle est dans le haut,
  // au-dessus si elle est dans le bas (clampé des deux côtés).
  const TIP_H = 210;
  const TIP_W = 320;
  const targetCenter = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
  const below = targetCenter < window.innerHeight * 0.55;
  const tipTop = rect
    ? below
      ? Math.min(rect.top + rect.height + 12, window.innerHeight - TIP_H - 12)
      : Math.max(12, rect.top - TIP_H - 12)
    : 80;
  const tipLeft = rect ? Math.max(12, Math.min(rect.left, window.innerWidth - TIP_W - 12)) : 12;

  return (
    <div className="fixed inset-0 z-50" data-testid="onboarding-tour" role="dialog" aria-modal="true" aria-label={t("onboarding.title")}>
      {/* Overlay + trou lumineux (box-shadow géant = animation fluide via transition) */}
      {rect ? (
        <div
          className="absolute rounded-xl transition-all duration-500 ease-in-out"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.65)",
            outline: "3px solid #10b981",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/65" />
      )}
      {/* Bulle d'explication */}
      <div
        className="absolute w-[320px] rounded-2xl border border-black/10 bg-white p-4 shadow-2xl transition-all duration-500 ease-in-out dark:border-white/10 dark:bg-zinc-900"
        style={{ top: tipTop, left: tipLeft }}
      >
        <p className="text-xs font-medium uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
          {t("onboarding.title")} · {step + 1}/{STEPS.length}
        </p>
        <p className="mt-1 font-semibold">{t(STEPS[step].titleKey)}</p>
        <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{t(STEPS[step].bodyKey)}</p>
        {/* Barre de progression animée */}
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500 ease-in-out"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            onClick={finish}
            data-testid="onboarding-skip"
            className="rounded-full px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            {t("onboarding.skip")}
          </button>
          <button
            onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
            data-testid="onboarding-next"
            className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
          >
            {isLast ? t("onboarding.finish") : t("onboarding.next")}
          </button>
        </div>
      </div>
    </div>
  );
}
