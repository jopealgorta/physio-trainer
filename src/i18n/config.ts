/**
 * Supported UI languages. Locales are NOT part of the URL (share links must stay clean);
 * the physio's locale comes from a cookie / their profile, the patient's from the
 * customer record, and signed-out visitors get their browser's language.
 * To add a language: add it here and create messages/<locale>.json with every key of en.json
 * (src/i18n/messages.test.ts enforces it).
 */
export const locales = ["en", "es"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";
export const localeCookieName = "NEXT_LOCALE";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/** Supported locale for a tag, matching the base language ("es-UY" → "es"), or null. */
function matchLocale(tag: string): Locale | null {
  const lower = tag.trim().toLowerCase();
  if (isLocale(lower)) return lower;
  const base = lower.split(/[-_]/)[0];
  return isLocale(base) ? base : null;
}

/** Picks the best supported locale for a candidate value, falling back to the default. */
export function resolveLocale(candidate: string | null | undefined): Locale {
  return (candidate && matchLocale(candidate)) || defaultLocale;
}

/**
 * Best supported locale for an Accept-Language header: highest q first (ties keep header
 * order), q=0 excluded, "*" means the default. Never throws.
 */
export function negotiateLocale(header: string | null | undefined): Locale {
  if (!header) return defaultLocale;
  const ranges = header
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.split(";");
      const qParam = params.map((param) => param.trim()).find((param) => param.startsWith("q="));
      const q = qParam === undefined ? 1 : Number(qParam.slice(2));
      return { tag: tag.trim(), q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((range) => range.tag !== "" && range.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);

  for (const { tag } of ranges) {
    if (tag === "*") return defaultLocale;
    const match = matchLocale(tag);
    if (match) return match;
  }
  return defaultLocale;
}

/** The request's locale: explicit (patient pages) → cookie → Accept-Language → default. */
export function pickLocale(sources: {
  explicit?: string;
  cookie?: string;
  acceptLanguage?: string | null;
}): Locale {
  if (sources.explicit) return resolveLocale(sources.explicit);
  const fromCookie = sources.cookie ? matchLocale(sources.cookie) : null;
  return fromCookie ?? negotiateLocale(sources.acceptLanguage);
}

/** Language picker options, each named in its own language ("English", "Español"). */
export function languageOptions(): { value: Locale; label: string }[] {
  return locales.map((value) => {
    const name = new Intl.DisplayNames([value], { type: "language" }).of(value) ?? value;
    return { value, label: name.charAt(0).toLocaleUpperCase(value) + name.slice(1) };
  });
}
