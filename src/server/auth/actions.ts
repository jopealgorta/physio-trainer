"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";

import { env } from "@/env";
import { safeNextPath } from "@/lib/redirects";
import { createClient } from "@/lib/supabase/server";

import type { MagicLinkState } from "./schemas";

function authUrl(path: "/auth/confirm" | "/auth/callback", next: string): string {
  return `${env.NEXT_PUBLIC_APP_URL}${path}?${new URLSearchParams({ next })}`;
}

/** Emails a sign-in link (creates the account on first use). */
export async function sendMagicLink(
  _state: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  const submitted = String(formData.get("email") ?? "");
  const email = z.email().safeParse(submitted.trim().toLowerCase());
  if (!email.success) return { status: "error", error: "emailInvalid", email: submitted };

  const next = safeNextPath(formData.get("next")?.toString());
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { emailRedirectTo: authUrl("/auth/confirm", next) },
  });
  if (error) return { status: "error", error: "sendFailed", email: submitted };
  return { status: "sent", email: email.data };
}

/** Starts the Google OAuth flow (PKCE); Google returns to /auth/callback. */
export async function signInWithGoogle(formData: FormData): Promise<void> {
  const next = safeNextPath(formData.get("next")?.toString());
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: authUrl("/auth/callback", next) },
  });
  if (error || !data.url) redirect("/login?error=oauthFailed");
  redirect(data.url as Route);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
