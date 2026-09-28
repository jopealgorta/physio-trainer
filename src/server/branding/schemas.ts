import { z } from "zod";

import {
  LOGO_MAX_BYTES,
  normalizePhone,
  normalizeWebsite,
  sniffImageType,
  type LogoType,
} from "@/lib/branding";
import { normalizeHex } from "@/lib/color";

const blankToNull = (value: string) => (value.trim() === "" ? null : value.trim());

/** Branding form fields. Messages are i18n keys (Settings.branding.errors.*). */
export const brandingSchema = z.object({
  clinicName: z
    .string()
    .default("")
    .transform((value) => value.trim())
    .pipe(z.string().max(80, "clinicNameTooLong"))
    .transform((value) => value || null),
  accentColor: z
    .string()
    .default("")
    .transform((value, ctx) => {
      if (!value.trim()) return null;
      const hex = normalizeHex(value);
      if (hex) return hex;
      ctx.addIssue({ code: "custom", message: "accentInvalid" });
      return z.NEVER;
    }),
  contactEmail: z
    .string()
    .default("")
    .transform(blankToNull)
    .pipe(z.email("emailInvalid").max(254, "emailInvalid").nullable())
    .transform((value) => value?.toLowerCase() ?? null),
  contactPhone: z
    .string()
    .default("")
    .transform((value, ctx) => {
      if (!value.trim()) return null;
      const phone = normalizePhone(value);
      if (phone) return phone;
      ctx.addIssue({ code: "custom", message: "phoneInvalid" });
      return z.NEVER;
    }),
  website: z
    .string()
    .default("")
    .transform((value, ctx) => {
      if (!value.trim()) return null;
      const result = normalizeWebsite(value);
      if (result.ok) return result.url;
      ctx.addIssue({ code: "custom", message: result.error });
      return z.NEVER;
    }),
  showContactToPatients: z
    .literal("on")
    .optional()
    .transform((value) => value === "on"),
  removeLogo: z
    .literal("1")
    .optional()
    .transform((value) => value === "1"),
});

export type BrandingInput = z.output<typeof brandingSchema>;
export type ValidLogo = { bytes: Uint8Array; type: LogoType };

/** Size limit, then the real type from magic bytes (the browser's MIME type is not trusted). */
export async function checkLogo(
  file: File,
): Promise<
  { ok: true; logo: ValidLogo } | { ok: false; error: "logoTooLarge" | "logoInvalidType" }
> {
  if (file.size > LOGO_MAX_BYTES) return { ok: false, error: "logoTooLarge" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  return type ? { ok: true, logo: { bytes, type } } : { ok: false, error: "logoInvalidType" };
}

export type BrandingFieldErrors = {
  clinicName?: "clinicNameTooLong";
  accentColor?: "accentInvalid";
  contactEmail?: "emailInvalid";
  contactPhone?: "phoneInvalid";
  website?: "websiteInvalid" | "websiteNotHttps";
  logo?: "logoTooLarge" | "logoInvalidType";
};

export type BrandingFormState =
  | { status: "idle" }
  | { status: "saved"; logoUrl: string | null }
  | { status: "error"; fieldErrors: BrandingFieldErrors; formError?: "unknown" | "uploadFailed" };

type SchemaField = Exclude<keyof BrandingFieldErrors, "logo">;

const KNOWN_CODES: Record<SchemaField, readonly string[]> = {
  clinicName: ["clinicNameTooLong"],
  accentColor: ["accentInvalid"],
  contactEmail: ["emailInvalid"],
  contactPhone: ["phoneInvalid"],
  website: ["websiteInvalid", "websiteNotHttps"],
};
const FALLBACK_CODES: Record<SchemaField, string> = {
  clinicName: "clinicNameTooLong",
  accentColor: "accentInvalid",
  contactEmail: "emailInvalid",
  contactPhone: "phoneInvalid",
  website: "websiteInvalid",
};

export function brandingFieldErrors(error: z.ZodError): BrandingFieldErrors {
  const flattened = z.flattenError(error).fieldErrors as Partial<Record<SchemaField, string[]>>;
  const result: Record<string, string> = {};
  for (const field of Object.keys(KNOWN_CODES) as SchemaField[]) {
    const message = flattened[field]?.[0];
    if (message === undefined) continue;
    result[field] = KNOWN_CODES[field].includes(message) ? message : FALLBACK_CODES[field];
  }
  return result as BrandingFieldErrors;
}
