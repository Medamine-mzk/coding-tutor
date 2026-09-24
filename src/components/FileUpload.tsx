"use client";

import { useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { Exercise } from "@/lib/exercise/types";

type Props = {
  onSingle: (ex: Exercise) => void;
  onMultiple?: (exs: Exercise[]) => void;
  onError?: (msg: string) => void;
};

const ACCEPT = ".txt,.md,.pdf,.docx,.png,.jpg,.jpeg";
const MAX_SIZE = 5 * 1024 * 1024;

export function FileUpload({ onSingle, onMultiple, onError }: Props) {
  const { locale, dir } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [multiple, setMultiple] = useState<Exercise[] | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function uploadFile(file: File) {
    if (file.size > MAX_SIZE) {
      const msg = locale === "ar" ? "الملف كبير جدا (5 ميغا كحد أقصى)" : locale === "en" ? "File too large (5 MB max)" : "Fichier trop volumineux (5 Mo max)";
      setError(msg);
      onError?.(msg);
      return;
    }
    setLoading(true);
    setError(null);
    setMultiple(null);
    setFileName(file.name);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/exercise/upload", { method: "POST", body: form });
      const data = await res.json() as { isExercise?: boolean; exercise?: Exercise; multiple?: boolean; exercises?: Exercise[]; clarification?: string; error?: string; detail?: string };

      if (!res.ok) {
        const msg = data.error ?? data.detail ?? "Erreur d'upload";
        setError(msg);
        onError?.(msg);
        return;
      }
      if (data.isExercise === false) {
        const msg = data.clarification ?? "Aucun exercice reconnu";
        setError(msg);
        onError?.(msg);
        return;
      }
      if (data.multiple && data.exercises?.length) {
        setMultiple(data.exercises);
        onMultiple?.(data.exercises);
        return;
      }
      if (data.exercise) {
        onSingle(data.exercise);
      } else {
        setError("Réponse inattendue");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file) uploadFile(file);
  }

  return (
    <div className="mt-4" dir={dir}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
        aria-label={locale === "ar" ? "رفع ملف" : locale === "en" ? "Upload file" : "Importer un fichier"}
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center cursor-pointer transition-colors ${dragOver ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950" : "border-black/10 bg-zinc-50 hover:bg-zinc-100 dark:border-white/10 dark:bg-zinc-800 dark:hover:bg-zinc-700"}`}
        data-testid="file-dropzone"
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
          data-testid="file-input"
        />
        <p className="text-sm font-medium">
          {loading ? (locale === "ar" ? "جاري الرفع..." : locale === "en" ? "Uploading..." : "Import en cours…") : locale === "ar" ? "اسحب الملف أو انقر للاختيار" : locale === "en" ? "Drag file or click to choose" : "Glissez un fichier ou cliquez"}
        </p>
        <p className="mt-1 text-xs text-zinc-500">.txt, .md, .pdf, .docx, .png, .jpg — 5 Mo max</p>
        {fileName ? <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400" data-testid="file-name">{fileName}</p> : null}
        {loading ? <p className="mt-1 text-xs text-emerald-600">Analyse…</p> : null}
      </div>

      {error ? (
        <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200" role="alert" data-testid="file-error">
          {error}
        </div>
      ) : null}

      {multiple ? (
        <div className="mt-3 rounded-xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-zinc-900" data-testid="multi-picker">
          <p className="text-sm font-medium">
            {locale === "ar" ? `تم العثور على ${multiple.length} تمارين` : locale === "en" ? `${multiple.length} exercises found — pick one` : `${multiple.length} exercices trouvés — choisissez-en un`}
          </p>
          <ul className="mt-2 space-y-1">
            {multiple.map((ex, idx) => (
              <li key={ex.id}>
                <label className={`flex items-center gap-2 rounded-lg border px-2 py-1 text-sm cursor-pointer ${selectedIdx === idx ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950" : "border-black/10 dark:border-white/10"}`}>
                  <input
                    type="radio"
                    name="multi-ex"
                    checked={selectedIdx === idx}
                    onChange={() => setSelectedIdx(idx)}
                    data-testid={`multi-radio-${idx}`}
                  />
                  <span className="flex-1 truncate">{ex.title}</span>
                  <span className="text-xs text-zinc-500">{ex.examples[0]?.input ?? ""} → {ex.examples[0]?.output ?? ""}</span>
                </label>
              </li>
            ))}
          </ul>
          <button
            onClick={() => {
              const chosen = multiple[selectedIdx];
              if (chosen) onSingle(chosen);
              setMultiple(null);
            }}
            className="mt-3 inline-flex rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
            data-testid="btn-pick-exercise"
          >
            {locale === "ar" ? "تأكيد الاختيار" : locale === "en" ? "Confirm selection" : "Confirmer le choix"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
