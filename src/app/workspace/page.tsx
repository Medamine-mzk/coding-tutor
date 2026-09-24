"use client";
import { useI18n } from "@/lib/i18n";

export default function WorkspacePage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold">{t("nav.workspace")}</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Three panels land in Tickets 02 and 07: Exercise + Steps | Editor + Console | Tutor chat. Responsive stacked tabs on mobile.
      </p>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {[
          { title: t("workspace.exercise"), desc: "Statement + milestones" },
          { title: t("workspace.editor"), desc: "CodeMirror 6 + Pyodide Worker" },
          { title: t("workspace.tutor"), desc: "Hint ladder 0-5, never the solution" },
        ].map((p) => (
          <div key={p.title} className="rounded-2xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
            <h2 className="font-semibold">{p.title}</h2>
            <p className="mt-1 text-sm text-zinc-500">{p.desc}</p>
          </div>
        ))}
      </div>
      <p className="mt-6 text-xs text-zinc-500">LanguageRunner interface at <code>src/lib/runners/LanguageRunner.ts</code> — see PROJECT_SPEC.md:70</p>
    </div>
  );
}
