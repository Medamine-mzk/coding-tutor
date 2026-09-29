/**
 * Détection grossière de la langue d'une réponse tuteur — filet de sécurité
 * général (aucun contenu par exercice) : si le LLM répond en anglais alors
 * que l'élève est en fr/ar, la route rebascule sur le fallback FR.
 *
 * Les blocs de code sont ignorés (identifiants Python en anglais : for,
 * print, input, return... ne doivent pas fausser la détection).
 */

const ENGLISH_STOPWORDS = [
  "the", "this", "that", "these", "those",
  "what", "when", "where", "which", "who",
  "with", "from", "have", "your", "yours",
  "would", "should", "could", "there", "their",
  "before", "after", "let's", "lets",
  "clarify", "problem", "words", "about", "think",
  "first", "then", "also", "because", "own",
  "more", "most", "other", "such", "only",
  "just", "will", "very", "using", "smaller",
  "values", "cases", "write", "writing",
];

const FRENCH_MARKERS = [
  "à", "ç", "è", "é", "ê", "ë", "î", "ï", "ô", "ù", "û",
  "le", "la", "les", "des", "une", "est", "sont",
  "que", "qui", "pour", "dans", "avec", "pas",
  "votre", "votre", "tu", "vous", "nous",
  "ton", "ta", "tes", "mon", "ma", "mes",
  "cette", "ces", "sur", "plus", "tout",
  "faire", "fait", "comment", "quel", "quelle",
  "où", "donc", "astuce", "indice", "erreur",
];

/** Retire les blocs ```...``` et le code `inline` avant détection. */
export function stripCodeForLangDetect(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]*`/g, " ");
}

function countWholeWords(hay: string, words: string[]): number {
  let n = 0;
  for (const w of words) {
    // ASCII words: match on word boundaries; accented single chars: substring is fine
    const re = /^[a-z']+$/i.test(w)
      ? new RegExp(`\\b${w.replace(/'/g, "\\'")}\\b`, "gi")
      : new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const m = hay.match(re);
    if (m) n += m.length;
  }
  return n;
}

export function looksEnglish(text: string): boolean {
  const t = stripCodeForLangDetect(text);
  return countWholeWords(t, ENGLISH_STOPWORDS) >= 3;
}

export function looksFrench(text: string): boolean {
  const t = stripCodeForLangDetect(text);
  return countWholeWords(t, FRENCH_MARKERS) >= 2;
}

export function hasArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

/** Vrai si la réponse semble dans la langue de l'élève. */
export function responseMatchesLocale(text: string, locale: "fr" | "ar" | "en"): boolean {
  const t = stripCodeForLangDetect(text);
  if (locale === "ar") return hasArabic(t) || !/[a-zA-Z]{4,}/.test(t);
  if (locale === "fr") {
    if (looksFrench(t)) return true;
    return !looksEnglish(t);
  }
  // en : refuse l'arabe ou un français marqué
  if (hasArabic(t)) return false;
  return !looksFrench(t);
}
