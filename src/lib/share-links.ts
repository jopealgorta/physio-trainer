// Imported by server code, client components and tests: no server-only modules.
import { slugify } from "./handles";
import { whatsappHref } from "./phone";

/** What a link opens: everything active for the customer, or one routine or plan. */
export const SHARE_TARGETS = ["customer", "routine", "weekly_plan"] as const;
export type ShareTarget = (typeof SHARE_TARGETS)[number];

/** Crockford base32 as lowercase: digits and letters minus i, l, o, u. 32 symbols = 5 bits each. */
export const CODE_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
export const CODE_LENGTH = 8;
export const SLUG_MAX = 40;
const FALLBACK_SLUG = "link";
const CODE_PATTERN = /^[0-9a-hjkmnp-tv-z]{8}$/;

type RandomBytes = (length: number) => Uint8Array;
const cryptoBytes: RandomBytes = (length) => crypto.getRandomValues(new Uint8Array(length));

/** 8 random characters (40 bits). 256 is a multiple of 32, so `byte & 31` is unbiased. */
export function generateCode(randomBytes: RandomBytes = cryptoBytes): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[bytes[i]! & 31];
  return code;
}

export const isShareCode = (value: string): boolean => CODE_PATTERN.test(value);

/**
 * Splits the `[slug]` URL segment into the cosmetic slug and the lookup code: the code is the
 * 8 characters after the last hyphen (or the whole segment). Case-insensitive; null when invalid.
 */
export function parseSlugParam(param: string): { slug: string; code: string } | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(param);
  } catch {
    return null;
  }
  const match = /^(?:(.*)-)?([^-]{8})$/.exec(decoded.toLowerCase());
  if (!match || !isShareCode(match[2]!)) return null;
  return { slug: match[1] ?? "", code: match[2]! };
}

/** Default slug for a link: "María López" → "maria-lopez", at most 40 chars, never empty. */
export function shareSlug(text: string): string {
  const slug = slugify(text).slice(0, SLUG_MAX).replace(/-+$/, "");
  return slug || FALLBACK_SLUG;
}

export const buildSharePath = (handle: string, slug: string, code: string): string =>
  `/${handle}/${slug}-${code}`;

/** `base` is the app origin (`NEXT_PUBLIC_APP_URL`); a trailing slash is ignored. */
export const buildShareUrl = (base: string, handle: string, slug: string, code: string): string =>
  `${base.replace(/\/+$/, "")}${buildSharePath(handle, slug, code)}`;

/** WhatsApp chat with the customer when their number is international, else the chooser. */
export function whatsappShareHref(text: string, phone: string | null): string {
  const base = (phone ? whatsappHref(phone) : null) ?? "https://wa.me/";
  return `${base}?text=${encodeURIComponent(text)}`;
}

export const mailtoShareHref = (email: string | null, subject: string, body: string): string =>
  `mailto:${email ? encodeURIComponent(email).replace(/%40/g, "@") : ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
