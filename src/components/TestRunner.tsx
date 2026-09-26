"use client";

import type { TestCase } from "@/lib/exercise/types";
import type { TestReport } from "@/lib/runners/LanguageRunner";

type Props = {
  tests: TestCase[];
  report: TestReport | null;
  running?: boolean;
};

export function TestRunner({ tests, report, running }: Props) {
  const visible = tests.filter((t) => !t.hidden);
  const hidden = tests.filter((t) => t.hidden);

  const reportMap = new Map(report?.results.map((r) => [r.testId, r]) ?? []);

  return (
    <div className="rounded-xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-zinc-900" data-testid="test-runner" role="region" aria-label="Test runner" aria-live="polite">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Tests</h4>
        {report ? (
          <span role="status" aria-live="polite" className={`rounded-full px-2 py-0.5 text-xs font-medium ${report.failed === 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"}`} data-testid="test-summary">
            {report.passed}/{report.total} passés
          </span>
        ) : (
          <span className="text-xs text-zinc-600">Pas encore exécuté</span>
        )}
      </div>

      {running ? <p className="mt-2 text-xs text-zinc-600">Exécution…</p> : null}

      {/* Visible tests */}
      <div className="mt-3">
        <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Tests visibles</p>
        <ul className="mt-1 space-y-1" data-testid="visible-tests">
          {visible.length === 0 ? <li className="text-xs text-zinc-600">Aucun test visible</li> : null}
          {visible.map((t) => {
            const r = reportMap.get(t.id);
            const passed = r?.passed;
            const isPending = !r;
            return (
              <li key={t.id} data-testid={`test-${t.id}`} className={`flex flex-col gap-1 rounded-lg border px-2 py-2 text-sm ${passed === true ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950" : passed === false ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950" : "border-black/5 bg-zinc-50 dark:border-white/10 dark:bg-zinc-800"}`}>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs">{t.id}</span>
                  <span className={`text-xs font-medium ${passed === true ? "text-emerald-700 dark:text-emerald-300" : passed === false ? "text-red-700 dark:text-red-300" : "text-zinc-600"}`}>{isPending ? "—" : passed ? "✓ pass" : "✗ fail"}</span>
                </div>
                {r && !r.passed ? (
                  <div className="grid gap-1 text-xs">
                    <div>
                      <span className="font-medium">Attendu (expected):</span> <span className="font-mono">{r.expected ?? t.expected}</span>
                    </div>
                    <div>
                      <span className="font-medium">Obtenu (actual):</span> <span className="font-mono">{r.actual ?? "—"}</span>
                    </div>
                    {r.message ? <p className="text-zinc-600 dark:text-zinc-400">{r.message.slice(0, 120)}</p> : null}
                  </div>
                ) : r && r.passed ? (
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">Sortie correcte ✓</p>
                ) : (
                  <p className="text-xs text-zinc-600">En attente d&apos;exécution</p>
                )}
                <p className="text-xs text-zinc-600">Input: <span className="font-mono">{t.input ?? t.stdin?.join(" ") ?? "—"}</span> → Expected: <span className="font-mono">{t.expected}</span></p>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Hidden tests */}
      <div className="mt-4">
        <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Tests cachés (évaluation)</p>
        <p className="text-xs text-zinc-600">Ne révèlent jamais l&apos;entrée/sortie au-delà de la catégorie.</p>
        <ul className="mt-1 space-y-1" data-testid="hidden-tests">
          {hidden.length === 0 ? <li className="text-xs text-zinc-600">Aucun test caché</li> : null}
          {hidden.map((t) => {
            const r = reportMap.get(t.id);
            const passed = r?.passed;
            const isPending = !r;
            return (
              <li key={t.id} data-testid={`test-${t.id}`} className={`flex items-center justify-between rounded-lg border px-2 py-1.5 text-sm ${passed === true ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950" : passed === false ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950" : "border-black/5 bg-zinc-50 dark:border-white/10 dark:bg-zinc-800"}`}>
                <span className="font-mono text-xs">{t.id} · {t.category ?? "edge case"}</span>
                <span className={`text-xs ${passed === true ? "text-emerald-700 dark:text-emerald-300" : passed === false ? "text-amber-700 dark:text-amber-300" : "text-zinc-600"}`}>
                  {isPending ? "—" : passed ? "✓ pass" : `✗ fail: ${t.category ?? "hidden"}`}
                </span>
              </li>
            );
          })}
        </ul>
        {report && hidden.some((t) => !reportMap.get(t.id)?.passed) ? (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Hidden test {hidden.find((t) => !reportMap.get(t.id)?.passed)?.id} failed: {hidden.find((t) => !reportMap.get(t.id)?.passed)?.category}</p>
        ) : null}
      </div>
    </div>
  );
}
