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
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold">Rejoindre un exercice</h1>
      <p className="mt-1 text-sm text-zinc-600">Entre le code donné par ton enseignant (ex: PY-7X2K) et ton prénom. Pas de compte nécessaire.</p>
      <form onSubmit={handleJoin} className="mt-6 space-y-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Code de l'exercice</span>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="PY-7X2K" className="rounded-xl border border-black/10 bg-zinc-50 px-3 py-2 font-mono text-sm tracking-widest" required pattern="PY-[A-Z0-9]{4}" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Ton prénom (affiché au prof)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Yasmine" className="rounded-xl border border-black/10 bg-zinc-50 px-3 py-2 text-sm" required maxLength={30} />
        </label>
        <button disabled={loading} type="submit" className="w-full rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {loading ? "Connexion…" : "Rejoindre →"}
        </button>
      </form>
      {error ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <p className="mt-6 text-xs text-zinc-500">
        Astuce : ton navigateur garde un <code>join_token</code> en localStorage. Si tu reviens sur le même appareil, tu reprends la même identité sans ressaisir. Sur un autre appareil, ressaisis le même code + même prénom — une nouvelle ligne apparaîtra côté prof (MVP).
      </p>
    </div>
  );
}
