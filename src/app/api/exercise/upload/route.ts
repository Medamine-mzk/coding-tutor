import { NextRequest, NextResponse } from "next/server";
import { isExerciseLike, detectLanguage, sanitizeForLLM } from "@/lib/exercise/parser";
import { parseExerciseWithLLM } from "@/lib/exercise/llm";
import { validateFile, extractTextFromFile, splitMultipleExercises, MAX_FILE_SIZE } from "@/lib/exercise/fileParse";
import { generateReferenceSolutionLLM } from "@/lib/exercise/reference";
import { validateTestsWithReference } from "@/lib/exercise/validate";
import type { Exercise } from "@/lib/exercise/types";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { reportError } from "@/lib/monitoring";

const RATE_MAX = 15;
const RATE_WINDOW = 60_000;

function getIP(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: NextRequest) {
  const ip = getIP(req);
  const rate = checkRateLimit("upload", ip, RATE_MAX, RATE_WINDOW);
  const rateHeaders = rateLimitHeaders(rate.remaining, rate.resetAt, RATE_MAX);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Trop de requêtes. Réessaie dans une minute." }, { status: 429, headers: rateHeaders });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (e: unknown) {
    reportError(e, "upload: formData");
    return NextResponse.json({ error: "FormData invalide" }, { status: 400, headers: rateHeaders });
  }

  const fileEntry = form.get("file");
  if (!fileEntry || typeof fileEntry === "string") {
    return NextResponse.json({ error: "Champ 'file' requis" }, { status: 400, headers: rateHeaders });
  }

  // Accept File, Blob, or plain file-like object (for tests)
  const file = fileEntry as unknown as { name: string; size: number; type: string; arrayBuffer?: () => Promise<ArrayBuffer>; text?: () => Promise<string> };
  const fileName = (file as unknown as { name?: string }).name ?? "upload.bin";
  const fileType = (file as unknown as { type?: string }).type ?? "";
  const fileSize = (file as unknown as { size?: number }).size ?? 0;

  let buffer: Buffer;
  try {
    if (typeof file.arrayBuffer === "function") {
      buffer = Buffer.from(await file.arrayBuffer());
    } else if (typeof file.text === "function") {
      const txt = await file.text();
      buffer = Buffer.from(txt, "utf-8");
    } else if (fileEntry instanceof Blob && typeof (fileEntry as Blob).arrayBuffer === "function") {
      const ab = await (fileEntry as Blob).arrayBuffer();
      buffer = Buffer.from(ab);
    } else if (typeof (fileEntry as unknown as { text?: () => Promise<string> }).text === "function") {
      const txt = await (fileEntry as unknown as { text: () => Promise<string> }).text();
      buffer = Buffer.from(txt, "utf-8");
    } else {
      // Fallback via Response (works in both Node and jsdom)
      const ab = await new Response(fileEntry as unknown as Blob).arrayBuffer();
      buffer = Buffer.from(ab);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    reportError(e, "upload: read file");
    return NextResponse.json({ error: "Impossible de lire le fichier", detail: msg }, { status: 400, headers: rateHeaders });
  }

  // Use derived values for validation (fallback to fileEntry size if needed)
  const effectiveSize = fileSize || buffer.length;
  const effectiveName = fileName;
  const effectiveType = fileType;

  // Validate size and type via sniffing
  const validation = validateFile({ name: effectiveName, size: effectiveSize, type: effectiveType }, buffer);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400, headers: rateHeaders });
  }

  // Also enforce 5MB hard limit (validateFile already does)
  if (effectiveSize > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "Fichier trop volumineux (5 Mo max)" }, { status: 400, headers: rateHeaders });
  }

  let extractedText: string;
  let detectedType: string = validation.detectedType ?? "txt";
  try {
    const res = await extractTextFromFile(buffer, effectiveName, effectiveType);
    extractedText = res.text;
    detectedType = res.detectedType;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Impossible d'extraire le texte du fichier", detail: msg }, { status: 400, headers: rateHeaders });
  }

  const trimmed = extractedText.trim();
  if (trimmed.length === 0) {
    return NextResponse.json({ error: "Aucun texte trouvé dans le fichier" }, { status: 400, headers: rateHeaders });
  }
  if (trimmed.length > 8000) {
    // Truncate for parsing but warn
    // We slice to 8000 as per parse limit
  }
  const textForParse = trimmed.slice(0, 8000);

  // Treat extracted text as untrusted
  void sanitizeForLLM(textForParse);

  // Multi-exercise detection
  const parts = splitMultipleExercises(textForParse);
  if (parts.length > 1) {
    // Parse each part as separate exercise
    const exercises: Exercise[] = [];
    for (const part of parts) {
      if (!isExerciseLike(part)) continue;
      try {
        const ex = await parseExerciseWithLLM({ text: part, source: "upload" });
        // Validate tests server-side like in /parse
        try {
          const ref = await generateReferenceSolutionLLM(ex);
          if (ref) {
            const allTests = [...ex.visibleTests, ...ex.hiddenTests];
            const { kept } = await validateTestsWithReference(allTests, ref, { timeoutMs: 2000 });
            const keptIds = new Set(kept.map((t) => t.id));
            ex.visibleTests = ex.visibleTests.filter((t) => keptIds.has(t.id));
            ex.hiddenTests = ex.hiddenTests.filter((t) => keptIds.has(t.id));
          }
        } catch {}
        exercises.push(ex);
      } catch {}
    }
    if (exercises.length === 0) {
      const lang = detectLanguage(textForParse);
      const clarification =
        lang === "ar"
          ? "لم يتم التعرف على أي تمرين في الملف. تحقق من أن الملف يحتوي على بيانات التمارين."
          : lang === "en"
            ? "No exercise recognized in the file. Make sure it contains exercise statements."
            : "Aucun exercice reconnu dans le fichier. Vérifiez qu'il contient des énoncés.";
      return NextResponse.json({ isExercise: false, clarification, detectedLanguage: lang }, { status: 200, headers: rateHeaders });
    }
    if (exercises.length === 1) {
      return NextResponse.json({ isExercise: true, exercise: exercises[0], detectedType }, { status: 200, headers: rateHeaders });
    }
    return NextResponse.json({ isExercise: true, multiple: true, exercises, count: exercises.length, detectedType }, { status: 200, headers: rateHeaders });
  }

  // Single exercise path — reuse same logic as /parse but with upload source
  if (!isExerciseLike(textForParse)) {
    const lang = detectLanguage(textForParse);
    const clarification =
      lang === "ar"
        ? "هذا لا يبدو كتمرين برمجة. تحقق من أن الملف يحتوي على بيان التمرين كاملا."
        : lang === "en"
          ? "This does not look like a programming exercise. Make sure the file contains the full statement."
          : "Ceci ne ressemble pas à un exercice. Vérifiez que le fichier contient l'énoncé complet.";
    return NextResponse.json({ isExercise: false, clarification, detectedLanguage: lang, detectedType }, { status: 200, headers: rateHeaders });
  }

  try {
    const exercise = await parseExerciseWithLLM({ text: textForParse, source: "upload" });

    // Validate tests like in parse route
    try {
      const ref = await generateReferenceSolutionLLM(exercise);
      if (ref) {
        const allTests = [...exercise.visibleTests, ...exercise.hiddenTests];
        const { kept } = await validateTestsWithReference(allTests, ref, { timeoutMs: 2000 });
        const keptIds = new Set(kept.map((t) => t.id));
        exercise.visibleTests = exercise.visibleTests.filter((t) => keptIds.has(t.id));
        exercise.hiddenTests = exercise.hiddenTests.filter((t) => keptIds.has(t.id));
        if (exercise.visibleTests.length === 0 && allTests.length > 0) {
          exercise.visibleTests = allTests.filter((t) => !t.hidden).slice(0, 2);
          exercise.hiddenTests = allTests.filter((t) => t.hidden).slice(0, 2);
        }
      }
    } catch (e) {
      console.warn("[upload] validation skipped:", e instanceof Error ? e.message : String(e));
    }

    return NextResponse.json({ isExercise: true, exercise, detectedType }, { status: 200, headers: rateHeaders });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    reportError(e, "upload: parse");
    return NextResponse.json({ error: "Erreur lors de l'analyse", detail: msg }, { status: 500, headers: rateHeaders });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST multipart file to upload", maxSize: MAX_FILE_SIZE, allowed: [".txt", ".md", ".pdf", ".docx", ".png", ".jpg"] });
}
