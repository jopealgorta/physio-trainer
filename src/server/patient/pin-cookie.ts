import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/** One cookie per link, named by its code, so several links can be unlocked at once. */
export const pinCookieName = (code: string): string => `pin_${code}`;

/** How long an unlocked link stays unlocked on that device. */
export const PIN_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Proof that this browser entered the right PIN: an HMAC of the code and the stored PIN hash.
 * Changing or removing the PIN changes the hash, and regenerating the link changes the code, so
 * either invalidates every token issued before.
 */
export function pinToken(secret: string, code: string, pinHash: string): string {
  return createHmac("sha256", secret).update(`${code}:${pinHash}`).digest("base64url");
}

export function isPinTokenValid(
  secret: string,
  code: string,
  pinHash: string,
  token: string | undefined,
): boolean {
  if (!token) return false;
  const expected = Buffer.from(pinToken(secret, code, pinHash));
  const actual = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Cookie lifetime: the default, shortened so it never outlives an expiring link. */
export function pinCookieMaxAge(expiresAt: Date | null, now: Date = new Date()): number {
  if (!expiresAt) return PIN_COOKIE_MAX_AGE_SECONDS;
  const remaining = Math.floor((expiresAt.getTime() - now.getTime()) / 1000);
  return Math.max(0, Math.min(PIN_COOKIE_MAX_AGE_SECONDS, remaining));
}
