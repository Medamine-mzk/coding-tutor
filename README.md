# PyMentor — Guided Coding Tutor

> **Vision:** Tunisian students learn Python by doing, with an AI tutor that guides but never hands over the solution. `PROJECT_SPEC.md` is the source of truth.

[![Stack](https://img.shields.io/badge/Stack-Next.js%20%2B%20TS%20%2B%20Tailwind-blue)](#)
[![i18n](https://img.shields.io/badge/i18n-fr%20%7C%20ar%20(RTL)%20%7C%20en-green)](#)
[![Tests](https://img.shields.io/badge/Tests-vitest%20%2B%20Testing%20Library-lightgrey)](#)

## Quick start

```bash
npm install
npm run dev      # http://localhost:3000
npm run lint
npm run typecheck
npm test
npm run build
```

Copy env vars:

```bash
cp .env.example .env
# set ANTHROPIC_API_KEY and TUTOR_MODEL
```

## Project structure

```
.
├── src/
│   ├── app/
│   │   ├── layout.tsx        # root HTML with Geist fonts, I18nProvider, Header/Footer
│   │   ├── page.tsx          # landing: hero + exercise intake card (fr/ar/en)
│   │   └── globals.css       # tailwind + RTL + dark mode
│   ├── components/
│   │   ├── Header.tsx        # locale switcher + theme toggle
│   │   ├── Footer.tsx
│   │   ├── LandingClient.tsx # trilingual landing + textarea (wires to /api/exercise/parse in Ticket 03)
│   │   └── LocaleSwitcher.tsx
│   ├── i18n/
│   │   ├── config.ts         # locales fr/ar/en, default fr
│   │   └── messages/{fr,en,ar}.json
│   ├── lib/
│   │   └── i18n.tsx          # React context, html lang/dir sync, localStorage
│   └── test/
│       ├── setup.ts
│       ├── i18n.test.tsx
│       └── landing.test.tsx
├── docs/
│   ├── adr/0001-0005         # Pyodide/Worker, CodeMirror, API routes, Prisma, next-intl
│   └── agents/               # issue-tracker local .scratch, domain docs
├── .agents/plans/            # build plan 2026-09-24
├── public/manifest.json      # PWA scaffold
├── PROJECT_SPEC.md
└── CONTEXT.md                # tutor glossary (Exercise, Milestone, Session, HintLevel, LanguageRunner…)
```

## i18n

- Files: `src/i18n/messages/{fr,ar,en}.json`
- Default: `fr`. Switcher stores `localStorage.locale`, sets `document.documentElement.lang` and `dir` (`ar` → `rtl`).
- Theme toggle stores `localStorage.theme`, toggles `html.dark` class.
- Future: migrate to `src/app/[locale]/` routing via `next-intl` middleware (see ADR 0005) when Ticket 11 polish lands.

## Build order (spec §12)

1. Scaffold + i18n + tooling — **done** (this commit)
2. IDE + runner (CodeMirror 6, Pyodide Worker, LanguageRunner interface, timeout, stdin)
3. Exercise intake text → `/api/exercise/parse` → confirm/edit
4. Milestones + tests generation + server validation
5. Tutor chat v1 (hint ladder 0-5, streaming, quick actions)
6. Anti-leak layer (output filter, would-pass check, ≥50 adversarial prompts in CI)
7. Test runner UI + milestone auto-complete + completion screen
8. File upload (txt/md/pdf/docx + images OCR, multi-exercise pick)
9. PWA/offline, perf budget <200KB gzipped, SW caching Pyodide
10. Built-in library ~20 Python exercises (fr/ar/en, Bac-aware)
11. Polish: a11y ≥90, mobile stacked tabs, rate limit, analytics

## Domain docs

- `CONTEXT.md` — glossary only. Read before any code change.
- `docs/adr/` — five decisions recorded so far; see `docs/agents/domain.md` for how skills consume them.
- Skills: `skills/` retained for agentic workflows (`/grill-with-docs` → `/to-spec` → `/to-tickets` → `implement` + `tdd` + `codebase-design` + `code-review`).

## Verification (spec §13)

```bash
npm run lint && npm run typecheck && npm test && npm run build
# Lighthouse: Performance ≥85 Accessibility ≥90 mobile (target for Ticket 09/11)
# Anti-leak: ≥50 adversarial prompts (Ticket 06 CI suite)
```

## Skills install (for contributors using Claude Code / Codex)

Claude Code plugin: `claude plugins install mattpocock-skills` or `/plugin install mattpocock-skills` (official marketplace `claude-plugins-official`).
Other agents: `npx skills@latest add mattpocock/skills` — see `.agents/install-block.md`.

No em-dashes in any prose per `CLAUDE.md` rule.
