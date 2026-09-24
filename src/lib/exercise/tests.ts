import type { Exercise, TestCase } from "./types";

function nanoid(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function visibleTestsFromExamples(exercise: Exercise): TestCase[] {
  return exercise.examples.slice(0, 2).map((ex, i) => ({
    id: `t_vis_${i + 1}`,
    input: ex.input,
    stdin: ex.input.split(/[ \n]+/).filter(Boolean),
    expected: ex.output,
    kind: "stdout" as const,
    hidden: false,
  }));
}

export function generateHiddenTests(exercise: Exercise): TestCase[] {
  const hidden: TestCase[] = [];
  const stmt = exercise.statement.toLowerCase();

  // Generic edge cases for sum-like exercises
  if (stmt.includes("somme") || stmt.includes("sum") || stmt.includes("addition") || /a\s*\+\s*b/.test(stmt) || exercise.concepts.includes("loops") ) {
    // Empty / zero
    hidden.push({
      id: `t_hid_${nanoid()}`,
      input: "0 0",
      stdin: ["0", "0"],
      expected: "0",
      kind: "stdout",
      hidden: true,
      category: "edge case with zero",
    });
    // Negative
    hidden.push({
      id: `t_hid_${nanoid()}`,
      input: "-5 10",
      stdin: ["-5", "10"],
      expected: "5",
      kind: "stdout",
      hidden: true,
      category: "edge case with negative",
    });
    // Large boundary per constraints -1000 ≤ n ≤ 1000
    hidden.push({
      id: `t_hid_${nanoid()}`,
      input: "1000 1000",
      stdin: ["1000", "1000"],
      expected: "2000",
      kind: "stdout",
      hidden: true,
      category: "boundary with max",
    });
    // Single element? for list exercises
    if (exercise.concepts.includes("lists")) {
      hidden.push({
        id: `t_hid_${nanoid()}`,
        input: "1\n5",
        stdin: ["1", "5"],
        expected: "5",
        kind: "stdout",
        hidden: true,
        category: "edge case with single element",
      });
    }
  }

  // Conditional exercise: different branches
  if (exercise.concepts.includes("conditionals")) {
    hidden.push({
      id: `t_hid_${nanoid()}`,
      input: "0",
      stdin: ["0"],
      expected: exercise.examples[0]?.output ?? "0",
      kind: "stdout",
      hidden: true,
      category: "edge case with zero input",
    });
  }

  // If no hidden yet, generate at least 2 generic hidden from examples with modified values
  if (hidden.length === 0 && exercise.examples.length > 0) {
    const base = exercise.examples[0];
    hidden.push({
      id: `t_hid_${nanoid()}`,
      input: base.input.includes(" ") ? base.input.split(" ").map(() => "0").join(" ") : "0",
      stdin: base.input.split(/[ \n]+/).map(() => "0"),
      expected: "0",
      kind: "stdout",
      hidden: true,
      category: "edge case with zero",
    });
    hidden.push({
      id: `t_hid_${nanoid()}`,
      input: base.input,
      stdin: base.input.split(/[ \n]+/).filter(Boolean),
      expected: base.output,
      kind: "stdout",
      hidden: true,
      category: "hidden mirror of example",
    });
  }

  // Cap at 4 hidden for MVP
  return hidden.slice(0, 4);
}

export function functionCallTestsForExercise(exercise: Exercise): TestCase[] {
  // If exercise mentions a function signature like `def add(a,b):` or `f(n)` we generate call tests
  const fnMatch = exercise.statement.match(/def\s+(\w+)\s*\(/);
  if (fnMatch) {
    const fn = fnMatch[1];
    // Example: f(3) == 9 style from spec — we try to infer
    // For now generate one generic call test per example
    return exercise.examples.slice(0, 1).map((ex, i) => ({
      id: `t_call_${i + 1}`,
      expected: ex.output,
      kind: "call" as const,
      fnCall: `${fn}(${ex.input.replace(/\s+/g, ", ")})`,
      hidden: false,
    }));
  }
  return [];
}
