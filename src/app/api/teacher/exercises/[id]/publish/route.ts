import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/teacher/auth";
import { getTeacherExerciseById, updateTeacherExercise } from "@/lib/teacher/store";
import { addComments } from "@/lib/teacher/addComments";
import { runPythonWithStdin } from "@/lib/exercise/runPython";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireTeacher(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const ex = await getTeacherExerciseById(id);
  if (!ex) return NextResponse.json({ error: "Exercice non trouvé" }, { status: 404 });
  if (ex.teacher_id !== auth.teacher.id) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });

  let reference_verified = ex.reference_verified;
  let commented_reference = ex.commented_reference ?? null;
  let warning: string | null = null;

  // Si une solution de référence existe : régénère les commentaires FR et
  // vérifie qu'elle produit les sorties des exemples fournis.
  if (ex.reference_solution && ex.reference_solution.trim()) {
    try {
      commented_reference = addComments(ex.reference_solution);
    } catch (e) {
      warning = `Génération des commentaires échouée: ${e instanceof Error ? e.message : String(e)}`;
    }
    if (ex.examples.length > 0) {
      for (const eg of ex.examples) {
        const stdin = eg.input.split("\n");
        if (stdin.length > 1 && stdin[stdin.length - 1] === "") stdin.pop();
        try {
          const res = await runPythonWithStdin(ex.reference_solution, stdin, 2000);
          if (res.sandboxUnavailable) {
            // Pas de Python sur cet hébergeur (ex. serverless) : on ne peut
            // pas vérifier — on ne remet pas en cause la correction du prof.
            warning = (warning ? `${warning} ` : "") + "Vérification automatique indisponible sur cet hébergeur (Python absent) — vérifiez la correction manuellement.";
            reference_verified = false;
            break;
          }
          const actual = res.stdout.trim();
          if (res.timedOut || res.exitCode !== 0 || actual !== eg.output.trim()) {
            warning = (warning ? `${warning} ` : "") + `La référence ne produit pas la sortie attendue pour "${eg.input}": obtenu "${actual.slice(0, 80)}".`;
            reference_verified = false;
            break;
          }
        } catch (e) {
          warning = (warning ? `${warning} ` : "") + `Vérification échouée: ${e instanceof Error ? e.message : String(e)}`;
          reference_verified = false;
          break;
        }
      }
      if (!warning || reference_verified !== false) reference_verified = true;
    } else {
      warning = (warning ? `${warning} ` : "") + "Aucun exemple fourni — impossible de vérifier la référence.";
      reference_verified = false;
    }
  } else {
    warning = "Aucune solution de référence attachée — l'exercice est publié avec reference_verified:false. Ajoutez une solution pour générer les indices.";
    reference_verified = false;
  }

  const updated = await updateTeacherExercise(id, {
    reference_verified,
    commented_reference,
  });

  return NextResponse.json({
    ok: true,
    exercise: updated,
    code: updated?.code,
    reference_verified,
    warning,
  });
}
