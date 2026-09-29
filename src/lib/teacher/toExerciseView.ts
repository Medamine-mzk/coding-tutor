import type { TeacherExercise } from "./types";
import type { Exercise, TestCase } from "../exercise/types";
import type { CanonicalExercise } from "../exercise/stepPlan";
import { toExerciseView } from "../exercise/exerciseService";

/**
 * Convertit un TeacherExercise en vue client Exercise.
 * Source unique utilisée par `POST /api/student/join` et `GET /api/student/exercise`.
 *
 * Points BAC :
 * - les exemples du prof deviennent les `visible_tests` (donc `examples` +
 *   tests du TestRunner), découpés par lignes `\n` — PAS par espaces, pour ne
 *   pas casser les exos à ligne unique ("chat chien chat") ;
 * - les contraintes du prof sont propagées via le schéma `CanonicalExercise.constraints`.
 * - les steps ont été supprimés : les indices sont générés depuis le commenté.
 */
function exampleToVisibleTest(eg: { input: string; output: string }, i: number): TestCase {
  const stdin = eg.input.split("\n");
  if (stdin.length > 1 && stdin[stdin.length - 1] === "") stdin.pop();
  return { id: `t_vis_${i}`, input: eg.input, stdin, expected: eg.output, kind: "stdout", hidden: false };
}

export function teacherExerciseToClientExercise(
  teacherEx: TeacherExercise,
  locale = "fr"
): Exercise {
  const canonical: CanonicalExercise = {
    id: teacherEx.canonical_id ?? `canon_${teacherEx.id}`,
    example_signature: "teacher",
    text_embedding: [],
    concepts: teacherEx.concepts,
    io_spec: teacherEx.io_spec,
    constraints: teacherEx.constraints ?? [],
    languages: {
      [locale]: {
        title: teacherEx.title,
        statement_display: teacherEx.statement,
      },
    },
    reference_solution_ref: teacherEx.reference_solution ? `ref_${teacherEx.id}` : "",
    reference_solution: teacherEx.reference_solution ?? "",
    hidden_tests: teacherEx.hidden_tests,
    visible_tests: (teacherEx.examples ?? []).slice(0, 4).map(exampleToVisibleTest),
    hit_count: 0,
    created_at: teacherEx.created_at,
  };
  return toExerciseView(canonical, locale);
}
