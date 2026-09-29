# Spec — UI/UX AA (WCAG 2.2) across whole site

## Problem
- Text not clear: `text-zinc-500` (#71717a) on `bg-white`/`bg-zinc-50` fails AAA (3.7:1), `disabled:bg-zinc-300` on `text-white` 1.6:1 unreadable, `OfflineBanner bg-amber-500 text-white` 2.8:1 fail, missing `dark:` variants cause light pills on dark bg, hardcoded hex in Editor/Console bypass Tailwind.
- Hydration mismatch persists on Header (aria-current/className) and theme/locale (SSR light vs client dark/ar).
- Inconsistent containers (max-w-6xl vs 5xl vs 4xl vs md), button radii (full vs lg), gap/border scales, no design tokens, no typographic scale.

## Solution
Achieve WCAG AA 4.5:1 for all normal text (3:1 large) in light and dark, fix hydration by making client-only state not affect SSR, and unify design tokens via Tailwind semantic layer.

## User Stories
- As a low-vision student I want exercise text at 4.5:1 so I can read statement/examples without strain (AA).
- As a dark-mode user I want all pills/borders/cards to invert correctly so I don't see light flashes.
- As any user I want no hydration console errors when navigating Home ↔ Teacher ↔ Library.
- As a keyboard user I want consistent focus rings on all inputs/buttons.
- As a teacher I want inputs with visible text (not white-on-white) when creating exercises.

## Implementation Decisions
- Tailwind v4: add `@custom-variant dark (&:where(.dark, .dark *))` and remove `@media (prefers-color-scheme: dark)` to make `.dark` class the single source (fix FOUC).
- Create `src/styles/tokens.css` with CSS variables `--color-bg`, `--color-fg`, `--color-muted`, `--color-primary`, `--color-border` mapped to Tailwind `bg-background` etc., and use them site-wide.
- Fix `src/lib/i18n.tsx`: read `Accept-Language` via `cookies()` server-side or gate `t()` behind `mounted` with skeleton, add `suppressHydrationWarning` on real DOM nodes for locale text.
- Fix `src/components/Header.tsx`: already has `mounted` + `suppressHydrationWarning` on Links, but need to also gate `t()` text and `theme` emoji behind mounted or suppress.
- Replace all `text-zinc-500` (xs helpers) with `text-zinc-600` (AA) or `text-zinc-500` only where `text-base` and large.
- Replace `disabled:bg-zinc-300 text-white` with `disabled:bg-zinc-100 disabled:text-zinc-400` (4.6:1).
- Fix `OfflineBanner` to `bg-amber-600` or `bg-amber-500 text-zinc-900`.
- Extract `Container` (`max-w-6xl` consistent) and `Button` (`rounded-full` primary, `rounded-lg` card) components.
- Add `axe-core` Playwright test asserting no violations on `/`, `/teacher/login`, `/teacher/exercises/new`, `/student/join`.

## Testing Decisions
- `npx tsc --noEmit` + `npm run build`
- `npx vitest run` (existing 279 tests)
- New `src/test/a11y-contrast.test.tsx` with `axe` or `getComputedStyle` contrast checks for the fixed components.
- Manual: hard reload `Ctrl+Shift+R` on `/` and `/teacher/exercises/new` in light/dark, verify no hydration error in console.

## Out of Scope
- High-contrast AAA (7:1) beyond AA.
- Full rebrand palette beyond `zinc/emerald/sky/amber`.
