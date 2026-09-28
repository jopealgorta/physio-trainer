import { DEFAULT_REDIRECT, safeNextPath } from "@/lib/redirects";

/** Error codes /login shows from its `error` search param (see Auth.errors in messages). */
export const LOGIN_ERRORS = ["linkInvalid", "oauthFailed", "unknown"] as const;
export type LoginError = (typeof LOGIN_ERRORS)[number];

export function parseLoginError(value: string | undefined): LoginError | null {
  return (LOGIN_ERRORS as readonly string[]).includes(value ?? "") ? (value as LoginError) : null;
}

/**
 * /login showing `error`, keeping where to go after signing in. `next` is sanitised, and left
 * out when it is the default (the login page falls back to it anyway).
 */
export function loginErrorPath(error: LoginError, next?: string | null): string {
  const params = new URLSearchParams({ error });
  const safeNext = safeNextPath(next);
  if (safeNext !== DEFAULT_REDIRECT) params.set("next", safeNext);
  return `/login?${params}`;
}
