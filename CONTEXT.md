# Guided Coding Tutor (Mchi Nekteb)

A web platform that helps Tunisian secondary and university students learn Python by doing, with an AI tutor that guides but never hands over the solution.

## Language

### Core exercise model

**Exercise**:
A structured programming task with title, statement, input/output spec, constraints, examples, difficulty, concepts, and generated tests and milestones.
_Avoid_: problem, kata, challenge

**Milestone**:
A visible step title within an Exercise that the student completes in any order, with internal success criteria and hint seeds used to detect progress.
_Avoid_: step, subtask, checkpoint

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
An attempt at solving one Exercise, with current code and status in_progress, completed, or abandoned. Anonymous via localStorage for MVP.
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
