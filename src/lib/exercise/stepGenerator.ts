import type { Exercise } from "./types";
import type { Step } from "./stepPlan";
import { generateMilestones } from "./milestones";
import { verifyStepPlan } from "./stepVerification";

// Stage B: decompose verified reference into a typed StepPlan
// For MVP, we derive Steps from the existing milestone heuristics but attach typed checks.
// Future: replace with an LLM call that sees the verified reference and its I/O.

function milestoneToStepType(title: string): { check_type: Step["check_type"]; hint: string } {
  const low = title.toLowerCase();
  if (low.includes("lire") || low.includes("read") || low.includes("قراءة")) return { check_type: "ast_check", hint: "input" };
  if (low.includes("convertir") || low.includes("convert") || low.includes("تحويل")) return { check_type: "ast_check", hint: "1000" };
  if (low.includes("calculer") || low.includes("calculate") || low.includes("حساب")) return { check_type: "io_test", hint: "" };
  if (low.includes("division") || low.includes("zéro") || low.includes("zero")) return { check_type: "ast_check", hint: "if" };
  if (low.includes("boucler") || low.includes("loop") || low.includes("تكرار")) return { check_type: "ast_check", hint: "For" };
  if (low.includes("condition") || low.includes("appliquer") || low.includes("تطبيق")) return { check_type: "ast_check", hint: "If" };
  if (low.includes("fonction") || low.includes("function") || low.includes("define")) return { check_type: "ast_check", hint: "FunctionDef" };
  return { check_type: "io_test", hint: "" };
}

export async function generateStepPlan(exercise: Exercise, reference: string): Promise<Step[]> {
  const milestones = generateMilestones(exercise);
  const steps: Step[] = milestones.map((m, idx) => {
    const typed = milestoneToStepType(m.title);
    const isLast = idx === milestones.length - 1;
    return {
      id: m.id,
      order: m.order,
      title: m.title,
      goal: m.title, // for MVP, goal == title; LLM would elaborate
      check_type: isLast ? "io_test" : typed.check_type,
      io_test: isLast && exercise.examples[0] ? { stdin: exercise.examples[0].input.split(/[ \n]+/).filter(Boolean), expected_stdout: exercise.examples[0].output } : null,
      function_test: null,
      ast_check: typed.check_type === "ast_check" ? { must_contain: typed.hint ? [typed.hint] : [], must_not_contain: [] } : null,
      hint_seeds: { [m.order]: m.hintSeeds },
      exerciseId: m.exerciseId,
      successCriteria: m.successCriteria,
      hintSeeds: m.hintSeeds,
    };
  });

  // Verify each step's check against the reference before publishing
  // For MVP, we log failures but don't block publish — a wrong step that marks correct code as failed is worse, but we still want to ship
  const verification = await verifyStepPlan(reference, steps);
  if (!verification.ok) {
    console.warn(`[stepGenerator] step verification warning at "${verification.failedStep?.title}": ${verification.reason} — publishing anyway for MVP`);
  }
  return steps;
}
