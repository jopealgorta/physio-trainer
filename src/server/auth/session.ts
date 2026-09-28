import "server-only";

import type { JwtPayload } from "@supabase/supabase-js";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { cache } from "react";

import { runAsPhysio, type Tx } from "@/db/rls";
import type { Physio } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/server/physios/queries";

export type SessionPhysio = { physioId: string; claims: JwtPayload };

/** The verified session (JWT checked by getClaims), or null. No database access. */
export const getSessionPhysio = cache(async (): Promise<SessionPhysio | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data || data.claims.role !== "authenticated") return null;
  return { physioId: data.claims.sub, claims: data.claims };
});

/**
 * Runs `fn` under RLS as the signed-in physio. Requires a session (redirects to /login),
 * not onboarding. Every physio-facing query and mutation goes through this.
 */
export async function withPhysio<T>(fn: (tx: Tx, physioId: string) => Promise<T>): Promise<T> {
  const session = await getSessionPhysio();
  if (!session) redirect("/login");
  return runAsPhysio(session.claims, fn);
}

/** The signed-in, onboarded physio. Redirects to /login or /onboarding otherwise. */
export const requirePhysio = cache(async (): Promise<{ physioId: string; profile: Physio }> => {
  const profile = await withPhysio((tx, physioId) => getProfile(tx, physioId));
  if (!profile) redirect("/login?error=unknown");
  if (!profile.onboardedAt) redirect("/onboarding" as Route);
  return { physioId: profile.id, profile };
});
