import { createBrowserClient } from "@supabase/ssr";

import { env } from "@/env";

/** Supabase client for Client Components. Runs as the signed-in physio (RLS applies). */
export function createClient() {
  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
