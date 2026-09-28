import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/env";

/**
 * Refreshes the Supabase auth session cookie on every request and reports whether the
 * request carries a valid session (JWT verified by getClaims).
 */
export async function updateSession(
  request: NextRequest,
): Promise<{ response: NextResponse; signedIn: boolean }> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  // Do not add code between createServerClient and getClaims(): it validates the JWT
  // and triggers the cookie refresh above.
  const { data } = await supabase.auth.getClaims();

  return { response, signedIn: data?.claims.role === "authenticated" };
}
