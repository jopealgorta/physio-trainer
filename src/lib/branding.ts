/**
 * Physio branding helpers (docs/specs/09-physio-branding.md). Pure: shared by the server
 * (getBranding) and the settings preview.
 */
import { brandTokens, type BrandTokens } from "./color";

export const BRANDING_BUCKET = "branding";
/** Stored logo (after the browser's resize). Matches the bucket's file_size_limit. */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
/** Picked file, before the browser resizes it; bigger images are too slow to decode. */
export const LOGO_SOURCE_MAX_BYTES = 10 * 1024 * 1024;
export const LOGO_MAX_DIMENSION = 512;
export const LOGO_ACCEPT = "image/png,image/webp,image/jpeg";

export type LogoType = "png" | "webp" | "jpeg";
export const LOGO_CONTENT_TYPES: Record<LogoType, string> = {
  png: "image/png",
  webp: "image/webp",
  jpeg: "image/jpeg",
};
export const LOGO_EXTENSIONS: Record<LogoType, string> = { png: "png", webp: "webp", jpeg: "jpg" };

export type AccentName =
  "teal" | "sky" | "blue" | "indigo" | "violet" | "pink" | "red" | "orange" | "green" | "slate";

/** Curated swatches; each is readable on white without adjustment (a test enforces it). */
export const ACCENT_PALETTE: readonly { name: AccentName; hex: string }[] = [
  { name: "teal", hex: "#0f766e" },
  { name: "sky", hex: "#0369a1" },
  { name: "blue", hex: "#2563eb" },
  { name: "indigo", hex: "#4f46e5" },
  { name: "violet", hex: "#7c3aed" },
  { name: "pink", hex: "#db2777" },
  { name: "red", hex: "#dc2626" },
  { name: "orange", hex: "#c2410c" },
  { name: "green", hex: "#15803d" },
  { name: "slate", hex: "#334155" },
];

const startsWith = (bytes: Uint8Array, prefix: number[], offset = 0) =>
  bytes.length >= offset + prefix.length && prefix.every((b, i) => bytes[offset + i] === b);
const ascii = (text: string) => [...text].map((ch) => ch.charCodeAt(0));

/** Real image type from the file's first bytes; the browser-supplied MIME type is not trusted. */
export function sniffImageType(bytes: Uint8Array): LogoType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return "webp";
  return null;
}

/**
 * International phone number as "+<digits>" (E.164 length 7–15 digits), or null. A leading
 * "00" counts as "+". Local numbers are rejected: WhatsApp links need the country code.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!/^(\+|00)[\d\s().-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/^00/, "").replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? `+${digits}` : null;
}

export function whatsappUrl(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}`;
}

const WEBSITE_MAX_LENGTH = 2048;

/** https URL; a bare domain gets "https://". Plain http is rejected, not silently upgraded. */
export function normalizeWebsite(
  input: string,
): { ok: true; url: string } | { ok: false; error: "websiteInvalid" | "websiteNotHttps" } {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > WEBSITE_MAX_LENGTH)
    return { ok: false, error: "websiteInvalid" };
  if (/^http:\/\//i.test(trimmed)) return { ok: false, error: "websiteNotHttps" };
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, error: "websiteInvalid" };
  }
  if (url.protocol !== "https:" || !url.hostname.includes(".")) {
    return { ok: false, error: "websiteInvalid" };
  }
  // Credentials in the URL can spoof the visible host ("kine.com@evil.com") or leak a secret.
  if (url.username || url.password) return { ok: false, error: "websiteInvalid" };
  return { ok: true, url: url.toString() };
}

export function logoPublicUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl}/storage/v1/object/public/${BRANDING_BUCKET}/${path}`;
}

export type BrandingSource = {
  displayName: string;
  clinicName: string | null;
  logoUrl: string | null;
  accentColor: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  showContactToPatients: boolean;
};

export type BrandingContact = {
  email: string | null;
  phone: string | null;
  whatsappUrl: string | null;
  website: string | null;
};

export type Branding = {
  clinicName: string;
  logoUrl: string | null;
  accentColor: string | null;
  /** null = app default colours. */
  tokens: BrandTokens | null;
  /** null when hidden from patients or nothing is set. */
  contact: BrandingContact | null;
};

/** What patient-facing surfaces show; the settings preview builds it from form state. */
export function buildBranding(source: BrandingSource): Branding {
  const contact: BrandingContact = {
    email: source.contactEmail,
    phone: source.contactPhone,
    whatsappUrl: source.contactPhone ? whatsappUrl(source.contactPhone) : null,
    website: source.website,
  };
  const hasContact = Boolean(contact.email || contact.phone || contact.website);
  return {
    clinicName: source.clinicName?.trim() || source.displayName,
    logoUrl: source.logoUrl,
    accentColor: source.accentColor,
    tokens: source.accentColor ? brandTokens(source.accentColor) : null,
    contact: source.showContactToPatients && hasContact ? contact : null,
  };
}
