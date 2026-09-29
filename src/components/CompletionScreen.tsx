"use client";

import { useI18n } from "@/lib/i18n";
import type { Exercise } from "@/lib/exercise/types";

type Props = {
  exercise: Pick<Exercise, "title" | "concepts" | "difficulty">;
  onContinue?: () => void;
  onRetry?: () => void;
};

export function CompletionScreen({ exercise, onContinue, onRetry }: Props) {
  const { locale, t } = useI18n();

  const reflection =
    locale === "ar"
      ? "ماذا قد يحدث إذا كانت القائمة فارغة؟ ماذا لو كان الإدخال كبيرا جدا؟"
      : locale === "en"
        ? "What would break if the list was empty? What if the input was very large?"
        : "Que se passerait-il si la liste était vide ? Et avec une entrée très grande ?";

  const concepts = exercise.concepts.join(", ") || "—";

  return (
    <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-6 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" data-testid="completion-screen" role="status">
      <h3 className="text-lg font-semibold">🎉 {locale === "ar" ? "أحسنت!" : locale === "en" ? "Well done!" : "Bravo !"}</h3>
      <p className="mt-1 text-sm leading-6">
        {locale === "ar" ? `أكملت "${exercise.title}"` : locale === "en" ? `You completed "${exercise.title}"` : `Tu as réussi "${exercise.title}"`}
      </p>
      <div className="mt-4 rounded-xl bg-white p-3 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
        <p className="font-medium">Réflexion · Reflection · تأمل</p>
        <p className="mt-1 leading-6">{reflection}</p>
        <p className="mt-2 text-xs text-zinc-600">Concepts vus : {concepts} · Difficulté {exercise.difficulty}/5</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={onContinue} className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700" data-testid="btn-continue">
          {locale === "ar" ? "تمرين تالي" : locale === "en" ? "Next exercise" : "Exercice suivant"}
        </button>
        <button onClick={onRetry} className="rounded-full border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-zinc-900 dark:text-emerald-300" data-testid="btn-retry">
          {t("workspace.run")} à nouveau
        </button>
      </div>
      <p className="mt-3 text-xs text-emerald-800 dark:text-emerald-300">Tu peux encore optimiser ou tenter un exercice de suivi — le tuteur peut suggérer une variante.</p>
    </div>
  );
}
