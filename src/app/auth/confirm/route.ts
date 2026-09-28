import type { EmailOtpType } from "@supabase/supabase-js";
import type { Route } from "next";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { safeNextPath } from "@/lib/redirects";
import { createClient } from "@/lib/supabase/server";
import { postSignInPath } from "@/server/auth/post-sign-in";

/** Magic-link landing: verifies the email token (works on any device), then redirects. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const next = safeNextPath(params.get("next"));
  if (!tokenHash || !type) redirect("/login?error=linkInvalid");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error || !data.session) redirect("/login?error=linkInvalid");

  redirect((await postSignInPath(supabase, data.session.access_token, next)) as Route);
}
