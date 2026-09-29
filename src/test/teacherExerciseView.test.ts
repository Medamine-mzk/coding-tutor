import { describe, it, expect } from "vitest";
import { teacherExerciseToClientExercise } from "@/lib/teacher/toExerciseView";
import type { TeacherExercise } from "@/lib/teacher/types";

function fakeTeacherEx(overrides: Partial<TeacherExercise> = {}): TeacherExercise {
  return {
    id: "ex_t1",
    teacher_id: "t1",
    code: "PY-TEST",
    title: "Somme de 1 à n",
    statement: "# Statement\nLire un entier n et afficher la somme 1+2+...+n.\n\n## Examples\n- input: 5\n  output: 15",
    language: "python",
    concepts: ["loops"],
    difficulty: 2,
    io_spec: "",
    constraints: ["-1000 ≤ n ≤ 1000"],
    examples: [{ input: "5", output: "15" }],
    hidden_tests: [],
    visible_tests: [],
    visibility: "code_only",
    created_via: "upload",
    reference_verified: true,
    reference_solution: "n = int(input())\nprint(n)",
    commented_reference: "# Stocke une valeur lue au clavier, convertie en entier dans n\nn = int(input())\n# Affiche n\nprint(n)",
    canonical_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("teacherExerciseToClientExercise", () => {
  it("propage exemples et contraintes du prof (plus de fallbacks 2 3 / a,b)", () => {
    const ex = teacherExerciseToClientExercise(fakeTeacherEx());
    expect(ex.examples).toEqual([{ input: "5", output: "15" }]);
    expect(ex.constraints).toEqual(["-1000 ≤ n ≤ 1000"]);
    expect(ex.title).toBe("Somme de 1 à n");
  });

  it("construit les visibleTests découpés par lignes", () => {
    const ex = teacherExerciseToClientExercise(
      fakeTeacherEx({ examples: [{ input: "3\n1\n2\n3", output: "6" }] })
    );
    expect(ex.visibleTests[0].stdin).toEqual(["3", "1", "2", "3"]);
    expect(ex.visibleTests[0].expected).toBe("6");
  });

  it("ne casse pas les entrées monoligne avec espaces", () => {
    const ex = teacherExerciseToClientExercise(
      fakeTeacherEx({ examples: [{ input: "chat chien chat", output: "chat" }] })
    );
    expect(ex.visibleTests[0].stdin).toEqual(["chat chien chat"]);
  });

  it("ne contient ni steps ni milestones (indices par commentaires)", () => {
    const ex = teacherExerciseToClientExercise(fakeTeacherEx()) as unknown as Record<string, unknown>;
    expect(ex["steps"]).toBeUndefined();
    expect(ex["milestones"]).toBeUndefined();
    expect(ex["currentStepOrder"]).toBeUndefined();
  });
});
