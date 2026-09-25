# Exercise cache with execution-verified matching and neverCache flag

Naive text-embedding matching merges "sum of a list" and "product of a list" despite near-identical phrasing, and an English-only embedder misses fr↔ar same-problem matches. Both would serve the wrong verified StepPlan.

Decision: platform-wide cache by default with a per-exercise `neverCache` boolean (Q1). Matching pipeline: 1) exact normalized-text hash, 2) embedding ANN (multilingual model covering fr/ar/en — LaBSE preferred for cross-lingual similarity until benchmarked vs mE5/BGE-M3 on the fr/ar/en library) in a second collection of the same vector store planned for hint retrieval (reuse, no new infra category; in-memory stub behind the same seam until that store exists per Q2), 3) for each candidate run the candidate's stored reference solution against the new submission's stated examples (whitespace/float/collection tolerance) — all match ⇒ merge. Only exact_hash and execution_verified auto-merge. No-examples case → one cheap LLM-judge on structured summaries, never auto-merge, log low-confidence to the single instructor-review surface (Q3: reuse the hint-review M6 queue, not a second queue). Concurrency via in-flight Map<normalizedHash, Promise>. Localization via `languages` map: translate display strings only, cache, no Stage A/B rerun. Version `step_plan_version` pinned per Session.

Why log-only for now: building a dedicated queue before we have data on low-confidence frequency is wasted work; the existing review surface is the same shape of problem.

