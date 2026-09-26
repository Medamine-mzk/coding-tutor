"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type TeacherExercise = {
  id: string;
  code: string;
  title: string;
  visibility: string;
  reference_verified: boolean;
  created_at: string;
};

export default function TeacherDashboard() {
  const [teacher, setTeacher] = useState<{ name: string; email: string } | null>(null);
  const [exercises, setExercises] = useState<TeacherExercise[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/teacher/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated) setTeacher(d.teacher);
        else window.location.href = "/teacher/login";
      });
    fetch("/api/teacher/exercises")
      .then((r) => r.json())
      .then((d) => {
        if (d.exercises) setExercises(d.exercises);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="mx-auto max-w-4xl px-4 py-12">Chargement…</div>;
  if (!teacher) return null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard — {teacher.name}</h1>
          <p className="text-sm text-zinc-600">{teacher.email}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/teacher/exercises/new" className="rounded-full bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700">
            + Nouvel exercice
          </Link>
          <a href="/api/teacher/auth/logout" className="rounded-full border border-black/10 px-4 py-2 text-sm">
            Déconnexion
          </a>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="font-semibold">Mes exercices ({exercises.length})</h2>
        {exercises.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Aucun exercice. Créez-en un manuellement, par upload ou avec l'IA.</p>
        ) : (
          <div className="mt-4 grid gap-4">
            {exercises.map((ex) => (
              <div key={ex.id} className="rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold">{ex.title}</h3>
                    <p className="text-xs text-zinc-500">
                      Code: <span className="font-mono font-bold text-emerald-700">{ex.code}</span> · {ex.visibility} · {ex.reference_verified ? "✓ vérifié" : "⚠ non vérifié"} · {new Date(ex.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Link href={`/teacher/exercises/${ex.id}`} className="rounded-full border border-black/10 px-3 py-1 text-xs hover:bg-zinc-50">
                      Détails
                    </Link>
                    <Link href={`/teacher/exercises/${ex.id}/progress`} className="rounded-full bg-zinc-900 px-3 py-1 text-xs text-white">
                      Progression
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 rounded-xl bg-zinc-50 p-4 text-sm dark:bg-zinc-800">
        <p className="font-medium">Partage aux élèves</p>
        <p className="mt-1 text-zinc-600">Donnez le code (ex: PY-7X2K) à vos élèves. Ils vont sur “Rejoindre un exercice” et entrent le code + leur prénom — pas de compte requis. Le tableau de progression se met à jour quand ils avancent dans les étapes.</p>
        <Link href="/student/join" className="mt-2 inline-block text-emerald-600 hover:underline">
          Page élève — rejoindre par code →
        </Link>
      </div>
    </div>
  );
}
