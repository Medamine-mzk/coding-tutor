# Guided Coding Tutor (Mchi Nekteb)

A web platform that helps Tunisian secondary and university students learn Python by doing, with an AI tutor that guides but never hands over the solution.

## Language

### Core exercise model

**Exercise**:
A structured programming task with title, statement, input/output spec, constraints, examples, difficulty, concepts, and generated tests and milestones.
_Avoid_: problem, kata, challenge

**Step** (replaces Milestone per addendum 1.2; Milestone is now exactly Step):
A verified, gradable stage of an Exercise with a typed check. Only the title is visible until the previous step passes; the goal and check are revealed progressively. The typed check is `io_test` (stdin→stdout), `function_test` (call named function, compare return), or `ast_check` (must_contain nodes).
_Avoid_: milestone (legacy), subtask, checkpoint

**CanonicalExercise**:
The single, verified, language-agnostic record for one distinct problem. Holds a multilingual embedding, example_signature, concepts, io_spec, reference_solution_ref (server-only), versioned StepPlan, hidden tests, and a languages cache. Created only after Stage A/B verification; reused via exact-hash or execution-verified matching.
_Avoid_: cached exercise, shared exercise

**ExerciseSubmission**:
A student's raw submission before it is linked to a CanonicalExercise. Holds raw_text, detected language, and match metadata (exact_hash, execution_verified, llm_judge_low_confidence, new) plus confidence.
_Avoid_: submission, attempt

**LocalizedCopy**:
The translated display strings for one language variant of a CanonicalExercise — title, statement_display, step_titles, step_goals — cached on demand without regenerating the StepPlan.
_Avoid_: translation, locale copy

**Concept**:
A programming idea tagged on an Exercise such as loops, conditionals, lists, functions, recursion.
_Avoid_: topic, tag, skill

**TestCase**:
A single input with expected output that validates student code, either stdout comparison or function-call assertion.
_Avoid_: test case, unit test

**Visible Test**:
A TestCase derived from the exercise examples and shown to the student with pass/fail and actual vs expected output.
_Avoid_: public test, sample test

**Hidden Test**:
An extra edge-case TestCase generated at parse time whose input and expected output are never revealed beyond a category label.
_Avoid_: secret test, private test

**Reference Solution**:
A correct solution held server-side only, used internally for test validation and tutor reasoning, never sent to the browser.
_Avoid_: answer, model solution, correct code

### Session and progress

**Session**:
An attempt at solving one Exercise, pinned to the `step_plan_version` it started with so an instructor edit mid-session does not change grading. Holds current code and status in_progress, completed, or abandoned. Anonymous via localStorage for MVP.
_Avoid_: attempt session, run

**Attempt**:
A single code submission within a Session, storing code, run result, and test report.
_Avoid_: submission, run, try

**HintEvent**:
A tutor interaction within a Session recording hint level used, milestone targeted, message content, and whether a leak was blocked.
_Avoid_: hint, help event

**Message**:
A single chat turn in a Session with role student or tutor.
_Avoid_: chat message, chat entry

### Tutor system

**HintLevel**:
The allowed ceiling of help from 0 Clarify through 5 Skeleton. Higher levels are more revealing and the student must earn the next level with a real code change and run.
_Avoid_: hint level, help level

**LanguageRunner**:
The pluggable interface that executes student code behind init, run, and runTests. Python is the first adapter via Pyodide in a Web Worker.
_Avoid_: runner, execution engine, sandbox

**Tutor Language**:
The language the tutor responds in, matching the student's language from the exercise or chat: French, Arabic, or English. Code and error names stay in English.
_Avoid_: locale, UI language
