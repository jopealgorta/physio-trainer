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
    return safeNextPath(new URLSearchParams(search).get("next"));
  }
  return null;
}
