import { createClient } from "@supabase/supabase-js";

/**
 * SERVER ONLY. Uses the service role key, which bypasses row level security.
 * Only used for the volunteer link page, after looking the delivery up by its secret token.
 * Never import this from a "use client" file.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
