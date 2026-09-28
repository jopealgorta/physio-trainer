import { NextResponse, type NextRequest } from "next/server";

import { routeGuard } from "@/lib/auth/route-guard";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const { response, signedIn } = await updateSession(request);
  const target = routeGuard(request.nextUrl.pathname, request.nextUrl.search, signedIn);
  if (!target) return response;

  const redirect = NextResponse.redirect(new URL(target, request.url));
  // Keep any refreshed session cookies on the redirect.
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

export const config = {
  matcher: [
    // Skip static assets, image optimisation, the health check, app icons, the service worker
    // and files with an extension.
    "/((?!_next/static|_next/image|api/health|favicon.ico|icon/|apple-icon|sw\\.js$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)",
  ],
};
