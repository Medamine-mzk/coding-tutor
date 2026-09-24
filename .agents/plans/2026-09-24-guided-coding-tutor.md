# Plan: Guided Coding Tutor — 2026-09-24

Source of truth: `PROJECT_SPEC.md` (Vision §1, Build Order §12). CONTEXT.md rewritten to tutor glossary. Decisions locked to recommended answers per user confirmation 2026-09-24.

## Decisions (recommended accepted)

- Issue tracker: local `.scratch/` markdown for now, migrate to GitHub when remote added.
- Repo shape: scaffold Next.js in place (this directory becomes the app, `skills/` retained for tooling).
- Target level: lycee basics to data structures, seed 10 Bac Informatique exercises, anonymous-only MVP, MSA primary with Derja tolerance, LLM budget cheapest fast model for chat plus stronger for parse.
- i18n default: fr default, ar RTL, en switcher, light/dark via CodeMirror themes, url locale routing.
- Execution: sequential implement per ticket for 01-03, parallel for 04/09/10 window, sequential 05-06 anti-leak focus.

## Build order ticket graph

See CONTEXT.md and docs/adr/0001-0005. Tickets 01-11 as in plan output. Blocking edges:
01 -> 02,03
03 -> 04,10
04 -> 05,08
05 -> 06
02,04 -> 07
01 -> 09
07,08,09,10 -> 11

## Seams (pre-agreed for tdd)

- LanguageRunner (init/run/runTests) — PythonRunner adapter via Pyodide Worker
- ExerciseParser (parse raw -> Exercise)
- TutorService (chat context assembly + streaming)
- AntiLeakFilter (filter + wouldPassAll)
- Editor/UI thin, Playwright

## Phase 0 done

- git init, CONTEXT.md, docs/adr/0001-0005, docs/agents/issue-tracker.md, docs/agents/domain.md, scaffold copy from create-next-app.

## Next

- Ticket 01: finish scaffold tailoring (package name, i18n, layout, PWA manifest, lint/test, verify).
- Prototype candidates: hint ladder LOGIC HTML, workspace 3-panel UI variants.
- Research candidates: Pyodide Worker + input queue + timeout, next-intl RTL, pdf/mammoth/vision OCR.
