-- PyMentor initial schema — run once in Supabase SQL editor.
-- Auth tokens are stateless HMAC (no session table needed).
-- RLS is enabled with NO policies (deny-by-default): the public/anon key can
-- read and write nothing. All server access uses the service_role key, which
-- bypasses RLS. Student display names stay private.

create table if not exists teachers (
  id text primary key,
  email text unique not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists teacher_exercises (
  id text primary key,
  teacher_id text not null references teachers(id) on delete cascade,
  code text unique not null,
  title text not null,
  statement text not null,
  language text not null default 'python',
  concepts jsonb not null default '[]',
  difficulty int not null default 2,
  io_spec text not null default '',
  constraints jsonb not null default '[]',
  examples jsonb not null default '[]',
  hidden_tests jsonb not null default '[]',
  visible_tests jsonb not null default '[]',
  visibility text not null default 'code_only',
  created_via text not null,
  reference_verified boolean not null default false,
  reference_solution text,
  commented_reference text,
  canonical_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_teacher_exercises_teacher on teacher_exercises(teacher_id);
create index if not exists idx_teacher_exercises_visibility on teacher_exercises(visibility);

create table if not exists student_identities (
  id text primary key,
  exercise_id text not null references teacher_exercises(id) on delete cascade,
  display_name text not null,
  join_token text unique not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_student_identities_exercise on student_identities(exercise_id);

create table if not exists sessions (
  id text primary key,
  exercise_id text not null,
  canonical_exercise_id text,
  current_code text not null default '',
  status text not null default 'in_progress',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  revealed_hints jsonb not null default '[]',
  student_identity_id text references student_identities(id) on delete set null,
  user_id text
);
create index if not exists idx_sessions_exercise on sessions(exercise_id);
create index if not exists idx_sessions_identity on sessions(student_identity_id);

-- Lockdown: RLS on, no policies = deny all for anon/authenticated roles.
-- The app's service_role key bypasses RLS.
alter table teachers enable row level security;
alter table teacher_exercises enable row level security;
alter table student_identities enable row level security;
alter table sessions enable row level security;
