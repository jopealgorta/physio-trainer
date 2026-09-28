import { createClient, type JwtPayload } from "@supabase/supabase-js";

import { env } from "@/env";

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

/** Supabase client with the secret key: admin API (create/delete users, generate links). */
export const adminClient = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SECRET_KEY,
  noSession,
);

/** JWT claims shaped like the ones getClaims() returns, for runAsPhysio in tests. */
export function testClaims(sub: string, email?: string): JwtPayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: "integration-tests",
    sub,
    aud: "authenticated",
    exp: now + 3600,
    iat: now,
    role: "authenticated",
    aal: "aal1",
    session_id: crypto.randomUUID(),
    email,
  };
}

/** Signs an existing user in without email and returns their access token. */
export async function signInTestUser(email: string): Promise<string> {
  const link = await adminClient.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw link.error;
  const client = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    noSession,
  );
  const { data, error } = await client.auth.verifyOtp({
    type: "email",
    token_hash: link.data.properties.hashed_token,
  });
  if (error || !data.session) throw error ?? new Error("verifyOtp returned no session");
  return data.session.access_token;
}
