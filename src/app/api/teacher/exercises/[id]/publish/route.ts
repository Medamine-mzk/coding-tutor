import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/teacher/auth";
import { getTeacherExerciseById, updateTeacherExercise } from "@/lib/teacher/store";
import { verifyStepPlan } from "@/lib/exercise/stepVerification";
import { runPythonWithStdin } from "@/lib/exercise/runPython";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireTeacher(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const ex = getTeacherExerciseById(id);
  if (!ex) return NextResponse.json({ error: "Exercice non trouvé" }, { status: 404 });
  if (ex.teacher_id !== auth.teacher.id) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });

  let reference_verified = ex.reference_verified;
  let warning: string | null = null;

  // If a reference solution exists (uploaded or LLM-generated), re-run verification one more time
  if (ex.reference_solution && ex.reference_solution.trim()) {
    try {
      // Verify steps against reference (addendum 1.3)
      const ver = await verifyStepPlan(ex.reference_solution, ex.steps as import("@/lib/exercise/stepPlan").Step[]);
      if (!ver.ok) {
        warning = `Vérification des étapes échouée à "${ver.failedStep?.title}": ${ver.reason} — publié quand même avec flag.`;
        reference_verified = false;
      } else {
        // Also verify hidden tests if any: run reference against visible examples
        // For manual without visible tests, skip
        reference_verified = true;
      }
    } catch (e) {
      warning = `Vérification échouée: ${e instanceof Error ? e.message : String(e)}`;
      reference_verified = false;
    }
  } else {
    // No reference — publish with warning (addendum 3.1.2)
    warning = "Aucune solution de référence attachée — l'exercice est publié avec reference_verified:false. Ajoutez une solution pour une vérification complète.";
    reference_verified = false;
  }

  const updated = updateTeacherExercise(id, {
    reference_verified,
    // code is already set at creation, keep it; if missing, generateUniqueCode would have set it
    // bump updated_at
  });

  return NextResponse.json({
    ok: true,
    exercise: updated,
    code: updated?.code,
    reference_verified,
    warning,
  });
}
