"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StudentJoinPage() {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/student/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: code.trim().toUpperCase(), display_name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      // Store join_token and exercise for workspace (workspace reads localStorage)
      localStorage.setItem("student_join_token", data.join_token);
      localStorage.setItem("student_identity", JSON.stringify(data.studentIdentity));
      localStorage.setItem("currentExercise", JSON.stringify(data.exercise));
      localStorage.setItem("currentExerciseId", data.exercise.id);
      localStorage.setItem("currentSessionId", data.session.id);
      // Also keep canonical code for progress updates
      localStorage.setItem("currentTeacherExerciseId", data.studentIdentity.exercise_id);
      router.push(`/workspace?exerciseId=${encodeURIComponent(data.exercise.id)}&join_token=${encodeURIComponent(data.join_token)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <div className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-indigo-50 p-6 text-center dark:border-sky-900 dark:from-sky-950 dark:to-indigo-950">
        <p className="text-xs font-medium uppercase tracking-widest text-sky-700 dark:text-sky-300">Mode classe</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Rejoindre un exercice</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-zinc-600 dark:text-zinc-400">Entre le code affiché au tableau et ton prénom. Pas d'email, pas de mot de passe — juste ton prénom pour que le prof te reconnaisse.</p>
      </div>
      <div className="mt-6 rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <form onSubmit={handleJoin} className="space-y-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Code de l'exercice</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="PY-7X2K"
              className="rounded-xl border border-black/10 bg-zinc-50 px-3 py-3 font-mono text-base tracking-[0.2em] text-center font-bold uppercase placeholder:tracking-normal placeholder:font-normal placeholder:text-sm dark:border-white/10 dark:bg-zinc-800"
              required
              pattern="PY-[A-Z0-9]{4}"
              maxLength={7}
              autoComplete="off"
              autoCapitalize="characters"
            />
            <span className="text-xs text-zinc-600">Exemple au tableau : PY-7X2K</span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Ton prénom</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Yasmine" className="rounded-xl border border-black/10 bg-zinc-50 px-3 py-3 text-sm dark:border-white/10 dark:bg-zinc-800" required maxLength={30} autoComplete="given-name" />
            <span className="text-xs text-zinc-600">Affiché tel quel dans le tableau du prof.</span>
          </label>
          <button disabled={loading} type="submit" className="w-full rounded-full bg-emerald-600 px-6 py-3 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">
            {loading ? "Connexion…" : "Rejoindre et commencer →"}
          </button>
        </form>
        {error ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p> : null}
      </div>
      <div className="mt-6 rounded-xl bg-zinc-50 p-4 text-xs leading-5 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
        <p className="font-medium">Comment ça marche ?</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>Ton navigateur garde un <code className="rounded bg-white px-1 py-0.5 font-mono text-xs dark:bg-zinc-900">join_token</code> en localStorage.</li>
          <li>Reviens sur le même appareil → tu reprends la même ligne côté prof.</li>
          <li>Nouvel appareil → même code + même prénom = nouvelle ligne (MVP, acceptable).</li>
        </ul>
      </div>
    </div>
  );
}
