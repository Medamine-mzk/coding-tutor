import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only Supabase client (service_role bypasses RLS).
// When SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are absent (local dev, tests),
// getSupabase() returns null and stores fall back to in-memory (+ .tmp disk).
// Never import this module from client components.

let cached: SupabaseClient | null | undefined;

export function isDbEnabled(): boolean {
  return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function getSupabase(): SupabaseClient | null {
  if (!isDbEnabled()) return null;
  if (cached === undefined) {
    cached = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}

// For tests: reset cached client between cases.
export function _resetSupabaseCache() {
  cached = undefined;
}
