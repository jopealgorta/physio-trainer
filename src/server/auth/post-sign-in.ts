import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { runAsPhysio } from "@/db/rls";
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
  const { data, error } = await supabase.auth.getClaims(accessToken);
  if (error || !data) return "/login?error=unknown";

  const profile = await runAsPhysio(data.claims, (tx, physioId) => getProfile(tx, physioId));
  if (!profile) return "/login?error=unknown";

  await setLocaleCookie(profile.locale);
  return profile.onboardedAt ? next : `/onboarding?${new URLSearchParams({ next })}`;
}
