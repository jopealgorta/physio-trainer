import { safeNextPath } from "@/lib/redirects";

/** Paths that need a signed-in physio. Keep in sync with src/app/(app) (a test enforces it). */
export const PROTECTED_PREFIXES = [
  "/dashboard",
  "/customers",
  "/library",
  "/routines",
  "/plans",
  "/settings",
  "/onboarding",
] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Optimistic redirect decision for the proxy. Returns the path to redirect to, or null.
 * The real checks are requirePhysio()/withPhysio() on the server.
 */
export function routeGuard(pathname: string, search: string, signedIn: boolean): string | null {
  if (!signedIn && isProtectedPath(pathname)) {
    return `/login?${new URLSearchParams({ next: `${pathname}${search}` })}`;
  }
  if (signedIn && pathname === "/login") {
    const params = new URLSearchParams(search);
    // A sign-in failure signs the physio back out, but if it hasn't taken effect yet, showing
    // the error still beats bouncing back to /dashboard and losing it.
    if (params.has("error")) return null;
    return safeNextPath(params.get("next"));
  }
  return null;
}
