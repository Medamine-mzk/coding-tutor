"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { verificationLabel } from "@/lib/teacher/verificationBadge";

type TeacherExercise = {
  id: string;
  code: string;
  title: string;
  visibility: string;
  reference_verified: boolean;
  verification_method?: string | null;
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
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-6 dark:border-emerald-900 dark:from-emerald-950 dark:to-teal-950">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Espace enseignant</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Bonjour, {teacher.name} 👋</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{teacher.email} · {exercises.length} exercice{exercises.length !== 1 ? "s" : ""} créé{exercises.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/teacher/exercises/new" className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700">
              <span aria-hidden>＋</span> Nouvel exercice
            </Link>
            <a href="/api/teacher/auth/logout" className="inline-flex items-center rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-medium hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-800">
              Déconnexion
            </a>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Mes exercices</h2>
          <span className="rounded-full bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white dark:bg-white dark:text-zinc-900">{exercises.length}</span>
        </div>
        {exercises.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-black/10 bg-zinc-50 p-8 text-center dark:border-white/10 dark:bg-zinc-900">
            <p className="text-sm font-medium">Aucun exercice pour l'instant</p>
            <p className="mt-1 text-sm text-zinc-600">Créez votre premier exercice en mode manuel (le plus rapide), ou laissez l'IA structurer un énoncé, ou importez un bundle `exercise.md` + `steps.json`.</p>
            <Link href="/teacher/exercises/new" className="mt-4 inline-flex rounded-full bg-zinc-900 px-4 py-2 text-sm text-white">
              Créer un exercice →
            </Link>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {exercises.map((ex) => (
              <div key={ex.id} className="group rounded-2xl border border-black/10 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-white/10 dark:bg-zinc-900">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="line-clamp-1 font-semibold leading-tight">{ex.title}</h3>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${ex.reference_verified ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-300"}`}>
                    {verificationLabel(ex.reference_verified, ex.verification_method)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-full bg-zinc-900 px-2.5 py-1 font-mono font-bold tracking-widest text-white dark:bg-white dark:text-zinc-900">{ex.code}</span>
                  <span className={`rounded-full px-2 py-0.5 ring-1 ${ex.visibility === "public_library" ? "bg-sky-50 text-sky-700 ring-sky-200" : "bg-zinc-100 text-zinc-700 ring-black/5 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-white/10"}`}>{ex.visibility === "public_library" ? "public" : "code only"}</span>
                  <span className="text-zinc-600">{new Date(ex.created_at).toLocaleDateString("fr-TN")}</span>
                </div>
                <div className="mt-4 flex gap-2">
                  <Link href={`/teacher/exercises/${ex.id}`} className="flex-1 rounded-full border border-black/10 px-3 py-1.5 text-center text-xs font-medium hover:bg-zinc-50 dark:border-white/10">
                    Détails
                  </Link>
                  <Link href={`/teacher/exercises/${ex.id}/progress`} className="flex-1 rounded-full bg-zinc-900 px-3 py-1.5 text-center text-xs font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900">
                    Progression →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-10 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950">
        <h3 className="font-semibold text-emerald-900 dark:text-emerald-100">Partage en classe — 30 secondes</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-emerald-800 dark:text-emerald-200">
          <li>
            Donnez le code <span className="font-mono font-bold">PY-XXXX</span> au tableau.
          </li>
          <li>Élèves → ` /student/join ` → code + prénom (pas de compte).</li>
          <li>Votre dashboard se met à jour en direct à chaque étape validée.</li>
        </ol>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/student/join" className="rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
            Tester la page élève →
          </Link>
          <Link href="/library" className="rounded-full border border-emerald-200 bg-white px-4 py-1.5 text-sm text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-transparent">
            Voir la bibliothèque publique
          </Link>
        </div>
      </div>
    </div>
  );
}
