"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { parseCommentedReference, getHintText } from "@/lib/tutor/commentHints";
import { verificationLabel } from "@/lib/teacher/verificationBadge";

const LEVEL_LABELS: Record<number, string> = {
  1: "1 — Commentaire",
  2: "2 — Cible",
  3: "3 — Fonction",
  4: "4 — Args partiels",
  5: "5 — Complet",
};

export default function TeacherExerciseDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [ex, setEx] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [commented, setCommented] = useState<string | null>(null);
  const [loadingCommented, setLoadingCommented] = useState(false);
  const [commentLevel, setCommentLevel] = useState(5);
  const commentPairs = useMemo(
    () => (commented ? parseCommentedReference(commented) : []),
    [commented]
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/teacher/exercises/${id}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          if (r.status === 401) {
            setFetchError("Non authentifié — veuillez vous reconnecter (lien magique, sans mot de passe).");
          } else {
            setFetchError((d as { error?: string }).error ?? "Exercice non trouvé.");
          }
          setLoading(false);
          return;
        }
        if (d.exercise) setEx(d.exercise as Record<string, unknown>);
        setLoading(false);
      })
      .catch(() => {
        setFetchError("Erreur réseau.");
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

  async function handlePreviewAsStudent() {
    if (!ex) return;
    const code = (ex as { code: string }).code;
    if (!code) {
      setMsg("Code PY-XXXX manquant — publiez d'abord l'exercice.");
      return;
    }
    setPreviewing(true);
    setMsg(null);
    try {
      // No password — student join only needs code + display_name (addendum teacher-pivot)
      const res = await fetch("/api/student/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, display_name: "Prof (aperçu)" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur aperçu");
      try {
        localStorage.setItem("student_join_token", data.join_token);
        localStorage.setItem("student_identity", JSON.stringify(data.studentIdentity));
        localStorage.setItem("currentExercise", JSON.stringify(data.exercise));
        localStorage.setItem("currentExerciseId", data.exercise.id);
        localStorage.setItem("currentSessionId", data.session.id);
        localStorage.setItem("currentTeacherExerciseId", data.studentIdentity.exercise_id);
      } catch {}
      // Also set cookie for server (fetch in WorkspaceClient will also read query param)
      router.push(`/workspace?exerciseId=${encodeURIComponent(data.exercise.id)}&join_token=${encodeURIComponent(data.join_token)}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewing(false);
    }
  }

  async function handleShowCommented() {
    if (commented) {
      setCommented(null);
      return;
    }
    setLoadingCommented(true);
    try {
      const res = await fetch(`/api/teacher/exercises/${id}/commented`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      setCommented(data.commented as string);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingCommented(false);
    }
  }

  if (loading) return <div className="mx-auto max-w-3xl px-4 py-12">Chargement…</div>;
  if (fetchError)
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">{fetchError}</p>
        <Link href="/teacher/login" className="mt-4 inline-block rounded-full bg-zinc-900 px-4 py-2 text-sm text-white">
          Aller à la connexion (lien magique, sans mot de passe) →
        </Link>
      </div>
    );
  if (!ex) return <div className="mx-auto max-w-3xl px-4 py-12">Exercice non trouvé.</div>;

  const code = (ex as { code: string }).code;
  const title = (ex as { title: string }).title;
  const visibility = (ex as { visibility: string }).visibility;
  const verified = (ex as { reference_verified: boolean }).reference_verified;
  const verificationMethod = (ex as { verification_method?: string | null }).verification_method ?? null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/teacher" className="text-sm text-zinc-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="mt-4 text-2xl font-bold">{title}</h1>
      <p className="mt-1 font-mono text-sm">
        Code: <span className="rounded bg-emerald-100 px-2 py-0.5 font-bold text-emerald-700">{code}</span> · {visibility} · {verificationLabel(verified, verificationMethod)}
      </p>
      {msg ? <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{msg}</p> : null}
      <div className="mt-6 flex flex-wrap gap-2">
        <button onClick={handlePublish} disabled={publishing} className="rounded-full bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50">
          {publishing ? "Publication…" : "Publier / Re-vérifier"}
        </button>
        <Link href={`/teacher/exercises/${id}/progress`} className="rounded-full border border-black/10 px-4 py-2 text-sm">
          Voir progression →
        </Link>
        <button onClick={handlePreviewAsStudent} disabled={previewing} className="rounded-full bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">
          {previewing ? "Ouverture…" : "Aperçu élève (sans mot de passe) →"}
        </button>
        <Link href={`/student/join`} className="rounded-full border border-black/10 px-4 py-2 text-sm">
          Tester via /student/join (code + prénom)
        </Link>
        <button onClick={handleShowCommented} disabled={loadingCommented} className="rounded-full border border-black/10 px-4 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50 dark:border-white/10">
          {loadingCommented ? "Génération…" : commented ? "Masquer la version commentée" : "Voir version commentée (FR)"}
        </button>
      </div>
      <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">L'aperçu crée une identité <span className="font-mono">Prof (aperçu)</span> avec ton code <span className="font-mono">{code}</span> — aucun mot de passe, même flux que l'élève (addendum: élève = code + display_name uniquement).</p>
      {commented ? (
        <div className="mt-6">
          <h2 className="text-sm font-semibold">Solution commentée (enseignant uniquement — jamais montrée à l'élève)</h2>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            Aperçu de ce que l'élève voit à chaque niveau d'indice (bouton « Indice suivant ») :
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Niveau d'indice à prévisualiser">
            {[1, 2, 3, 4, 5].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setCommentLevel(lvl)}
                aria-pressed={commentLevel === lvl}
                data-testid={`preview-level-${lvl}`}
                className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors ${
                  commentLevel === lvl
                    ? "bg-zinc-900 text-white ring-zinc-900 dark:bg-white dark:text-zinc-900 dark:ring-white"
                    : "bg-white text-zinc-700 ring-black/10 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-white/10"
                }`}
              >
                {LEVEL_LABELS[lvl]}
              </button>
            ))}
          </div>
          <div className="mt-3 space-y-2" data-testid="preview-pairs">
            {commentPairs.map((pair, idx) => (
              <div key={idx} className="overflow-auto rounded-xl bg-zinc-900 p-3 dark:bg-black">
                <p className="mb-1 font-mono text-[11px] font-bold text-amber-300">
                  Paire {idx + 1}/{commentPairs.length}
                </p>
                <pre className="whitespace-pre-wrap font-mono text-xs text-zinc-100">{getHintText(pair, commentLevel)}</pre>
              </div>
            ))}
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-zinc-600 hover:underline dark:text-zinc-400">
              Voir la référence commentée complète (niveau 5 partout)
            </summary>
            <pre className="mt-2 overflow-auto rounded-xl bg-zinc-900 p-4 text-xs text-zinc-100 dark:bg-black">{commented}</pre>
          </details>
        </div>
      ) : null}
      <pre className="mt-6 overflow-auto rounded-xl bg-zinc-50 p-4 text-xs dark:bg-zinc-800">{JSON.stringify(ex, null, 2)}</pre>
    </div>
  );
}
