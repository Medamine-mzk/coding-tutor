"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

export default function TeacherProgressPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/teacher/exercises/${id}/progress`)
      .then((r) => r.json())
      .then((d) => {
        setData(d as Record<string, unknown>);
        setLoading(false);
      });
  }, [id]);

  if (loading) return <div className="mx-auto max-w-4xl px-4 py-12">Chargement…</div>;
  if (!data || (data as { error?: string }).error) return <div className="mx-auto max-w-4xl px-4 py-12">Erreur: {(data as { error?: string }).error}</div>;

  const ex = (data as { exercise: { title: string; code: string } }).exercise;
  const roster = (data as { roster: Array<{ display_name: string; hintsRevealed: number; lastActive: string; sessionCount: number; completed: boolean }> }).roster;
  const aggregates = (data as { aggregates: { totalStudents: number; totalSessions: number; completedCount: number; completionRate: number } }).aggregates;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link href={`/teacher/exercises/${id}`} className="text-sm text-zinc-600 hover:underline">
        ← Détails de l'exercice
      </Link>
      <h1 className="mt-4 text-2xl font-bold">Progression — {ex.title}</h1>
      <p className="text-sm text-zinc-600">
        Code {ex.code} · {aggregates.totalStudents} élèves · {aggregates.totalSessions} sessions · {Math.round(aggregates.completionRate * 100)}% terminé
      </p>

      <div className="mt-6">
        <h2 className="font-semibold">Roster</h2>
        {roster.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">Aucun élève n'a encore rejoint avec ce code.</p>
        ) : (
          <div className="mt-2 overflow-auto rounded-xl border border-black/10">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs text-zinc-600">
                <tr>
                  <th className="px-3 py-2">Élève</th>
                  <th className="px-3 py-2">Indices révélés</th>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2">Dernière activité</th>
                  <th className="px-3 py-2">Sessions</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((r) => (
                  <tr key={r.display_name + r.lastActive} className="border-t border-black/5 dark:border-white/10">
                    <td className="px-3 py-2 font-medium">{r.display_name}</td>
                    <td className="px-3 py-2">{r.hintsRevealed}</td>
                    <td className="px-3 py-2">{r.completed ? "✓ terminé" : "en cours"}</td>
                    <td className="px-3 py-2 text-xs text-zinc-600">{new Date(r.lastActive).toLocaleString()}</td>
                    <td className="px-3 py-2">{r.sessionCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
