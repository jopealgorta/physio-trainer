import { z } from "zod";

import { locales } from "@/i18n/config";
import { handleProblem, type HandleProblem } from "@/lib/handles";
import { normalizeTimeZone } from "@/lib/timezones";

/** Profile fields edited in onboarding and settings. Messages are i18n keys (ProfileForm.*). */
export const profileSchema = z.object({
  displayName: z.string().trim().min(1, "displayNameRequired").max(80, "displayNameTooLong"),
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .superRefine((value, ctx) => {
      const problem = handleProblem(value);
      if (problem) ctx.addIssue({ code: "custom", message: problem });
    }),
  locale: z.enum(locales, { error: "localeInvalid" }),
  timezone: z.string().transform((value, ctx) => {
    const zone = normalizeTimeZone(value);
    if (zone) return zone;
    ctx.addIssue({ code: "custom", message: "timezoneInvalid" });
    return z.NEVER;
  }),
});

export type ProfileInput = z.output<typeof profileSchema>;

export type ProfileFieldErrors = {
  displayName?: "displayNameRequired" | "displayNameTooLong";
  handle?: HandleProblem | "taken";
  locale?: "localeInvalid";
  timezone?: "timezoneInvalid";
};

export type ProfileFormState =
  | { status: "idle" }
  | { status: "saved" }
  | {
      status: "error";
      fieldErrors: ProfileFieldErrors;
      /** The handle that was submitted, so the form only shows its error while it is unchanged. */
      submittedHandle: string;
      formError?: "unknown";
    };

type Field = keyof ProfileFieldErrors;

const KNOWN_CODES: Record<Field, readonly string[]> = {
  displayName: ["displayNameRequired", "displayNameTooLong"],
  handle: ["tooShort", "tooLong", "format", "reserved", "taken"],
  locale: ["localeInvalid"],
  timezone: ["timezoneInvalid"],
};

const FALLBACK_CODES: Required<ProfileFieldErrors> = {
  displayName: "displayNameRequired",
  handle: "format",
  locale: "localeInvalid",
  timezone: "timezoneInvalid",
};

/** First error per field as an i18n key; unexpected messages (e.g. a missing field) map to a fallback. */
export function profileFieldErrors(error: z.ZodError): ProfileFieldErrors {
  const flattened = z.flattenError(error).fieldErrors as Partial<Record<Field, string[]>>;
  const result: Record<string, string> = {};
  for (const field of Object.keys(FALLBACK_CODES) as Field[]) {
    const message = flattened[field]?.[0];
    if (message === undefined) continue;
    result[field] = KNOWN_CODES[field].includes(message) ? message : FALLBACK_CODES[field];
  }
  return result as ProfileFieldErrors;
}
