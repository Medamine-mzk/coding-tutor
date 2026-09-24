# Prisma with SQLite for dev and Postgres via Supabase for prod

Anonymous sessions use localStorage first, persisted entities use Prisma. SQLite keeps local dev and CI simple, Postgres via Supabase for deploy. This avoids blocking MVP on auth or complex infra.

Consequences: Prisma schema mirrors the spec data model Exercise, Milestone, Session, Attempt, HintEvent, Message.
