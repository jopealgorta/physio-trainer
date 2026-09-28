import type { Route } from "next";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { loginErrorPath } from "@/lib/auth/login-errors";
import { safeNextPath } from "@/lib/redirects";
import { createClient } from "@/lib/supabase/server";
import { postSignInPath } from "@/server/auth/post-sign-in";

/** OAuth (Google) landing: exchanges the PKCE code for a session, then redirects. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const next = safeNextPath(params.get("next"));
  if (!code) redirect(loginErrorPath("oauthFailed", next) as Route);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) redirect(loginErrorPath("oauthFailed", next) as Route);

  redirect((await postSignInPath(supabase, data.session.access_token, next)) as Route);
}
