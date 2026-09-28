export const DEFAULT_REDIRECT = "/dashboard";

const BASE = "http://placeholder.invalid";

/**
 * Returns `value` only if it is a same-origin path that is safe to redirect to after sign-in.
 * Anything else (other origins, protocol-relative or encoded tricks, auth pages that would
 * loop) returns `fallback`.
 */
export function safeNextPath(
  value: string | null | undefined,
  fallback: string = DEFAULT_REDIRECT,
): string {
  if (!value || !value.startsWith("/") || hasUnsafeCharacters(value)) return fallback;

  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;

  const path = `${url.pathname}${url.search}${url.hash}`;
  if (/^\/(?:\/|%2f|%5c)/i.test(path)) return fallback;
  if (url.pathname === "/login" || url.pathname.startsWith("/auth/")) return fallback;
  return path;
}

// Browsers treat "\" like "/" and drop tabs/newlines, which turns "/\evil" into "//evil".
function hasUnsafeCharacters(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (char === "\\" || code < 0x20 || code === 0x7f) return true;
  }
  return false;
}
