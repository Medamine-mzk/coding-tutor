# Verified StepPlan with typed checks (replaces Milestone sketch)

Milestone was a title + opaque successCriteria. The addendum replaces it with Step, where each step declares how it is graded: `io_test` (stdin→stdout), `function_test` (named function + args → return), or `ast_check` (must_contain AST nodes). Intermediate steps like "initialize a variable" are not runnable programs, so stdout tests would false-fail; function_test or ast_check is needed.

Generation is two-stage to avoid hallucination: Stage A asks the LLM to solve the exercise (reference + tests) and we verify the reference against its own tests in the sandbox; only then Stage B decomposes the verified solution into 3–7 steps whose expectations come from confirmed I/O, not guesses. Every step is re-verified against the reference before publish. Milestone in the spec is now exactly Step; `successCriteria` becomes the typed check.

Trade-off: two LLM calls + sandbox runs per new exercise, but a wrong step that marks correct student code as failed is worse than the cost. 3–7 steps balances guidance without outlining the whole algorithm.

