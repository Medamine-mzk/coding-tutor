# Issue Tracker

Local markdown tracker `.scratch/` for this phase. Each Issue is a file `.scratch/<feature>/issues/<NN>-<slug>.md` ordered by dependency. Stages use `Blocked by` frontmatter.

If GitHub remote is added later, migrate by publishing Issues via `gh issue create` and preserving blocking edges with labels `ready-for-agent`.

## Usage

- Frontier is unblocked, open issues with no unresolved blocker.
- Each issue template includes What to build, Blocked by, Status, Acceptance checkboxes.
