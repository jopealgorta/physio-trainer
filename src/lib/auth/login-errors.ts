/** Error codes /login shows from its `error` search param (see Auth.errors in messages). */
export const LOGIN_ERRORS = ["linkInvalid", "oauthFailed", "unknown"] as const;
export type LoginError = (typeof LOGIN_ERRORS)[number];

export function parseLoginError(value: string | undefined): LoginError | null {
  return (LOGIN_ERRORS as readonly string[]).includes(value ?? "") ? (value as LoginError) : null;
}
