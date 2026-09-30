-- PyMentor migration 0002: how the teacher reference was verified.
-- Nullable + no backfill: pre-existing rows simply show "non vérifié".
-- Apply in Supabase dashboard (SQL editor) BEFORE deploying the code that
-- writes this column; the publish route retries without it if missing.
alter table teacher_exercises
  add column if not exists verification_method text
  check (verification_method in ('local', 'remote', 'llm_dryrun'));
