import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/teacher/auth";
import { getTeacherExerciseById, updateTeacherExercise } from "@/lib/teacher/store";
import type { TeacherExercise } from "@/lib/teacher/types";
import { addComments } from "@/lib/teacher/addComments";
import { runPythonWithStdin } from "@/lib/exercise/runPython";
import { runPythonRemote, RemoteExecError, isRemoteExecEnabled } from "@/lib/exercise/remotePython";
import { dryRunVerify, DryRunUnavailable, needsThirdPartyModules } from "@/lib/exercise/dryRun";

// Remote verification (Wandbox) + LLM dry-run can take a few seconds per
// example; give the serverless function room (clamped by plan if needed).
export const maxDuration = 60;

type VerificationMethod = NonNullable<TeacherExercise["verification_method"]>;

function splitStdin(input: string): string[] {
  const lines = input.split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireTeacher(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const ex = await getTeacherExerciseById(id);
  if (!ex) return NextResponse.json({ error: "Exercice non trouvé" }, { status: 404 });
  if (ex.teacher_id !== auth.teacher.id) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });

  let reference_verified = ex.reference_verified;
  // `undefined` = pas encore (re)vérifié pendant cet appel ; on le persiste
  // seulement si la chaîne de vérification a produit un verdict.
  let verification_method: VerificationMethod | null | undefined = undefined;
  let commented_reference = ex.commented_reference ?? null;
  let warning: string | null = null;
  const addWarning = (w: string) => { warning = (warning ? `${warning} ` : "") + w; };

  // Si une solution de référence existe : régénère les commentaires FR et
  // vérifie qu'elle produit les sorties des exemples fournis.
  // Chaîne de vérification (code du prof uniquement — jamais de code élève) :
  // 1) python local (exécution réelle) → 2) Wandbox distant (exécution réelle,
  //    sauf numpy & co) → 3) dry-run LLM (sémantique, badge honnête).
  if (ex.reference_solution && ex.reference_solution.trim()) {
    try {
      commented_reference = addComments(ex.reference_solution);
    } catch (e) {
      addWarning(`Génération des commentaires échouée: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (ex.examples.length > 0) {
      const ref = ex.reference_solution;
      // Étape 1 : python local, exemple par exemple ( verdict réel ).
      let localVerdict: "pass" | "fail" | "unavailable" = "pass";
      let localDetail = "";
      for (const eg of ex.examples) {
        try {
          const res = await runPythonWithStdin(ref, splitStdin(eg.input), 2000);
          if (res.sandboxUnavailable) { localVerdict = "unavailable"; break; }
          const actual = res.stdout.trim();
          if (res.timedOut || res.exitCode !== 0 || actual !== eg.output.trim()) {
            localVerdict = "fail";
            localDetail = `La référence ne produit pas la sortie attendue pour "${eg.input}": obtenu "${actual.slice(0, 80)}".`;
            break;
          }
        } catch (e) {
          localVerdict = "fail";
          localDetail = `Vérification échouée: ${e instanceof Error ? e.message : String(e)}`;
          break;
        }
      }
      if (localVerdict === "pass") {
        reference_verified = true;
        verification_method = "local";
      } else if (localVerdict === "fail") {
        addWarning(localDetail);
        reference_verified = false;
        verification_method = null;
      } else {
        // Étape 2 : Wandbox distant, exemples en parallèle (verdict réel).
        let remoteVerdict: "pass" | "fail" | "unavailable" = "unavailable";
        let remoteDetail = "";
        if (isRemoteExecEnabled() && !needsThirdPartyModules(ref)) {
          try {
            const results = await Promise.all(
              ex.examples.map((eg) => runPythonRemote(ref, splitStdin(eg.input), 8000))
            );
            remoteVerdict = "pass";
            for (let i = 0; i < results.length; i++) {
              const r = results[i];
              if (r.missingModule) { remoteVerdict = "unavailable"; remoteDetail = r.missingModule; break; }
              if (r.timedOut || r.exitCode !== 0 || r.stdout.trim() !== ex.examples[i].output.trim()) {
                remoteVerdict = "fail";
                remoteDetail = `La référence ne produit pas la sortie attendue pour "${ex.examples[i].input}" (vérification distante): obtenu "${r.stdout.trim().slice(0, 80)}".`;
                break;
              }
            }
          } catch (e) {
            if (!(e instanceof RemoteExecError)) {
              remoteVerdict = "fail";
              remoteDetail = `Vérification distante échouée: ${e instanceof Error ? e.message : String(e)}`;
            }
            // RemoteExecError = pas de verdict (réseau/timeout) → on passe au dry-run.
          }
        }
        // Si needsThirdPartyModules(ref) : on saute Wandbox (pas de numpy
        // sur les sandboxes gratuites) et on va direct au dry-run LLM.
        if (remoteVerdict === "pass") {
          reference_verified = true;
          verification_method = "remote";
        } else if (remoteVerdict === "fail") {
          addWarning(remoteDetail);
          reference_verified = false;
          verification_method = null;
        } else {
          // Étape 3 : dry-run LLM (prédit les sorties, on compare nous-mêmes).
          try {
            const dry = await dryRunVerify(ref, ex.examples, { timeoutMs: 15000 });
            if (dry.ok) {
              reference_verified = true;
              verification_method = "llm_dryrun";
              addWarning("Référence vérifiée par IA (exécution simulée, non exécutée) — vérifiez la correction manuellement avant le cours.");
            } else {
              const bad = dry.perExample.find((p) => !p.match);
              addWarning(
                `La référence semble incohérente (vérification IA)${bad ? ` pour "${bad.input}": attendu "${bad.expected}", simulé "${bad.predicted}"` : ""} — vérifiez la correction.`
              );
              reference_verified = false;
              verification_method = null;
            }
          } catch (e) {
            if (e instanceof DryRunUnavailable) {
              addWarning("Vérification automatique indisponible (ni Python local, ni sandbox distant, ni IA) — vérifiez la correction manuellement.");
            } else {
              addWarning(`Vérification IA échouée: ${e instanceof Error ? e.message : String(e)}`);
            }
            reference_verified = false;
            verification_method = null;
          }
        }
      }
    } else {
      addWarning("Aucun exemple fourni — impossible de vérifier la référence.");
      reference_verified = false;
      verification_method = null;
    }
  } else {
    addWarning("Aucune solution de référence attachée — l'exercice est publié avec reference_verified:false. Ajoutez une solution pour générer les indices.");
    reference_verified = false;
    verification_method = null;
  }

  const updates: Partial<TeacherExercise> = { reference_verified, commented_reference };
  if (verification_method !== undefined) updates.verification_method = verification_method;
  let updated = await updateTeacherExercise(id, updates);
  if (!updated && verification_method !== undefined) {
    // Colonne verification_method absente (migration 0002 non appliquée) :
    // on persiste le reste sans elle au lieu d'échouer.
    const { verification_method: _drop, ...rest } = updates;
    void _drop;
    updated = await updateTeacherExercise(id, rest);
  }

  return NextResponse.json({
    ok: true,
    exercise: updated,
    code: updated?.code,
    reference_verified,
    verification_method: verification_method ?? null,
    warning,
  });
}
