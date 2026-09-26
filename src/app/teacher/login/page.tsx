"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function TeacherLoginPage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [sent, setSent] = useState(false);
  const [tokenForDev, setTokenForDev] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/teacher/auth/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      setSent(true);
      if (data.tokenForDev) {
        setTokenForDev(data.tokenForDev);
        // Auto-verify in dev for convenience
        const verifyRes = await fetch(`/api/teacher/auth/verify?token=${encodeURIComponent(data.tokenForDev)}`);
        if (verifyRes.ok) {
          router.push("/teacher");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <div className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-zinc-50 to-white p-6 text-center dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-950">
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Espace enseignant</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Connexion sans mot de passe</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-zinc-600 dark:text-zinc-400">Entrez votre email, nous vous envoyons un lien magique valable 15 minutes. Idéal pour le contexte lycée — pas de SSO institutionnel requis.</p>
      </div>
      <div className="mt-6 rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Email professionnel</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="prof@lycee.tn" className="rounded-xl border border-black/10 bg-zinc-50 px-3 py-3 text-sm dark:border-white/10 dark:bg-zinc-800" autoComplete="email" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Nom affiché aux élèves (optionnel)</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mme Ben Ali" className="rounded-xl border border-black/10 bg-zinc-50 px-3 py-3 text-sm dark:border-white/10 dark:bg-zinc-800" autoComplete="name" />
          </label>
          <button disabled={loading} type="submit" className="w-full rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900">
            {loading ? "Envoi…" : "Envoyer le lien magique →"}
          </button>
        </form>
      </div>
      {sent ? <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Lien envoyé. Vérifiez vos logs serveur en dev, ou votre email en prod.</p> : null}
      {tokenForDev ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs">
          <p className="font-medium">Dev — token:</p>
          <p className="mt-1 break-all font-mono">{tokenForDev}</p>
          <a href={`/api/teacher/auth/verify?token=${encodeURIComponent(tokenForDev)}`} className="mt-2 inline-block rounded-full bg-amber-600 px-3 py-1 text-xs text-white">Vérifier et aller au dashboard →</a>
        </div>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
