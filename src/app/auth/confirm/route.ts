import type { EmailOtpType } from "@supabase/supabase-js";
import type { Route } from "next";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { loginErrorPath } from "@/lib/auth/login-errors";
import { safeNextPath } from "@/lib/redirects";
import { createClient } from "@/lib/supabase/server";
import { postSignInPath } from "@/server/auth/post-sign-in";

/** Magic-link landing: verifies the email token (works on any device), then redirects. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const next = safeNextPath(params.get("next"));

  const supabase = await createClient();
  if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error && data.session) {
      redirect((await postSignInPath(supabase, data.session.access_token, next)) as Route);
    }
  }

  // A used or expired link (e.g. opened again from the inbox) is harmless when this browser is
  // already signed in: carry on to `next` instead of showing an error. A failed verifyOtp
  // leaves the existing session alone.
  const { data } = await supabase.auth.getClaims();
  if (data?.claims.role === "authenticated") redirect(next as Route);
  redirect(loginErrorPath("linkInvalid", next) as Route);
}
