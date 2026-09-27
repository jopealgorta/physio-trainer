/**
 * Supported UI languages. Locales are NOT part of the URL (share links must stay clean);
 * the physio's locale comes from a cookie / their profile, the patient's from the
 * customer record. To add a language: add it here and create messages/<locale>.json.
 */
export const locales = ["en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";
export const localeCookieName = "NEXT_LOCALE";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/** Picks the best supported locale for a candidate value, falling back to the default. */
export function resolveLocale(candidate: string | null | undefined): Locale {
  if (!candidate) return defaultLocale;
  if (isLocale(candidate)) return candidate;
  const base = candidate.toLowerCase().split(/[-_]/)[0];
  return isLocale(base) ? base : defaultLocale;
}
