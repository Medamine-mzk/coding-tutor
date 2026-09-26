"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

export default function TeacherExerciseDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [ex, setEx] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/teacher/exercises/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.exercise) setEx(d.exercise as Record<string, unknown>);
        setLoading(false);
      });
  }, [id]);

  async function handlePublish() {
    setPublishing(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/teacher/exercises/${id}/publish`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      setEx(data.exercise as Record<string, unknown>);
      setMsg(data.warning ? `Publié avec warning: ${data.warning}` : `Publié — code: ${data.code}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setPublishing(false);
    }
  }

  if (loading) return <div className="mx-auto max-w-3xl px-4 py-12">Chargement…</div>;
  if (!ex) return <div className="mx-auto max-w-3xl px-4 py-12">Exercice non trouvé.</div>;

  const code = (ex as { code: string }).code;
  const title = (ex as { title: string }).title;
  const visibility = (ex as { visibility: string }).visibility;
  const verified = (ex as { reference_verified: boolean }).reference_verified;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/teacher" className="text-sm text-zinc-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="mt-4 text-2xl font-bold">{title}</h1>
      <p className="mt-1 font-mono text-sm">
        Code: <span className="rounded bg-emerald-100 px-2 py-0.5 font-bold text-emerald-700">{code}</span> · {visibility} · {verified ? "✓ vérifié" : "⚠ non vérifié"}
      </p>
      {msg ? <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{msg}</p> : null}
      <div className="mt-6 flex gap-2">
        <button onClick={handlePublish} disabled={publishing} className="rounded-full bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50">
          {publishing ? "Publication…" : "Publier / Re-vérifier"}
        </button>
        <Link href={`/teacher/exercises/${id}/progress`} className="rounded-full border border-black/10 px-4 py-2 text-sm">
          Voir progression →
        </Link>
        <Link href={`/student/join`} className="rounded-full border border-black/10 px-4 py-2 text-sm">
          Tester côté élève (code)
        </Link>
      </div>
      <pre className="mt-6 overflow-auto rounded-xl bg-zinc-50 p-4 text-xs dark:bg-zinc-800">{JSON.stringify(ex, null, 2)}</pre>
    </div>
  );
}
