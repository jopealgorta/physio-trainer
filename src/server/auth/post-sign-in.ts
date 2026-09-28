import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { runAsPhysio } from "@/db/rls";
import { loginErrorPath } from "@/lib/auth/login-errors";
import { setLocaleCookie } from "@/server/i18n/locale-cookie";
import { getProfile } from "@/server/physios/queries";

/**
 * Where to send a physio right after a session was created, and remembers their language.
 * New physios go through onboarding first, keeping `next`.
 */
export async function postSignInPath(
  supabase: SupabaseClient,
  accessToken: string,
  next: string,
): Promise<string> {
  try {
    const { data, error } = await supabase.auth.getClaims(accessToken);
    if (error || !data) throw error ?? new Error("getClaims returned no data");

    const profile = await runAsPhysio(data.claims, (tx, physioId) => getProfile(tx, physioId));
    if (!profile) throw new Error("signed-in user has no physios row");

    await setLocaleCookie(profile.locale);
    return profile.onboardedAt ? next : `/onboarding?${new URLSearchParams({ next })}`;
  } catch {
    // The session cookie is already set at this point (verifyOtp/exchangeCodeForSession ran
    // before this call): sign out so /login shows the error instead of the proxy bouncing a
    // still-signed-in request straight back past it.
    await supabase.auth.signOut().catch(() => {});
    return loginErrorPath("unknown", next);
  }
}
