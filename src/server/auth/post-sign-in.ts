import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { runAsPhysio } from "@/db/rls";
import { loginErrorPath } from "@/lib/auth/login-errors";
import { avatarFromMetadata } from "@/lib/avatar";
import { setLocaleCookie } from "@/server/i18n/locale-cookie";
import { setAvatarUrl } from "@/server/physios/mutations";
import { getProfile } from "@/server/physios/queries";

/**
 * Where to send a physio right after a session was created; restores an onboarded physio's
 * language.
 * New physios go through onboarding first, keeping `next`. Also refreshes the profile photo
 * from the provider (Google), which may change between sign-ins.
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

    // Magic-link users have no photo in their metadata: keep whatever Google set before. Its own
    // transaction, and best-effort: a photo must never stand between a physio and their app.
    const avatarUrl = avatarFromMetadata(data.claims.user_metadata);
    if (avatarUrl && avatarUrl !== profile.avatarUrl) {
      await runAsPhysio(data.claims, (tx, physioId) => setAvatarUrl(tx, physioId, avatarUrl)).catch(
        () => {},
      );
    }

    // Before onboarding the row only has the column default; keep the language the physio
    // chose (or their browser's) while signed out. Onboarding saves it to the profile.
    if (profile.onboardedAt) await setLocaleCookie(profile.locale);
    return profile.onboardedAt ? next : `/onboarding?${new URLSearchParams({ next })}`;
  } catch {
    // The session cookie is already set at this point (verifyOtp/exchangeCodeForSession ran
    // before this call): sign out so /login shows the error instead of the proxy bouncing a
    // still-signed-in request straight back past it.
    await supabase.auth.signOut().catch(() => {});
    return loginErrorPath("unknown", next);
  }
}
