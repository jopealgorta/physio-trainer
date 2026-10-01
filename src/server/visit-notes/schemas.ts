import { z } from "zod";

import { isCalendarDate } from "@/lib/calendar-date";
import { hasSoapContent, PAIN_MAX, SOAP_MAX } from "@/lib/visit-notes";
import { formValues, idSchema, isUuid, type Result } from "@/server/customers/schemas";

export { formValues, idSchema, isUuid, type Result };

const blankToNull = (value: unknown) => {
  const text = typeof value === "string" ? value.trim() : value;
  return text === "" || text == null ? null : text;
};

/** Optional trimmed SOAP section: blank → null, longer than the limit → "tooLong". */
const soapText = z
  .preprocess((value) => value ?? "", z.string())
  .transform((value) => value.trim())
  .pipe(z.string().max(SOAP_MAX, "tooLong"))
  .transform((value) => value || null);

const visitedOn = z.preprocess(
  blankToNull,
  z.string("dateInvalid").refine(isCalendarDate, "dateInvalid").nullable(),
);

const caseId = z.preprocess(blankToNull, z.union([z.null(), z.uuid()], { error: "invalid" }));

const pain = z.preprocess(
  blankToNull,
  z.union(
    [
      z.null(),
      z.coerce
        .number({ error: "painOutOfRange" })
        .int("painOutOfRange")
        .min(0, "painOutOfRange")
        .max(PAIN_MAX, "painOutOfRange"),
    ],
    { error: "painOutOfRange" },
  ),
);

/** `visitedOn` null means "today in the physio's time zone", filled in by the action. */
export const visitNoteSchema = z
  .object({
    visitedOn,
    caseId,
    subjective: soapText,
    objective: soapText,
    assessment: soapText,
    plan: soapText,
    pain,
  })
  .superRefine((value, ctx) => {
    if (!hasSoapContent(value)) {
      ctx.addIssue({ code: "custom", path: ["soap"], message: "soapRequired" });
    }
  });
export type VisitNoteInput = {
  visitedOn: string | null;
  caseId: string | null;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  pain: number | null;
};

export type VisitNoteField = keyof VisitNoteInput | "soap";
export type VisitNoteFieldErrors = Partial<Record<VisitNoteField, string>>;

export type VisitNoteFormState =
  | { status: "idle" }
  | { status: "saved" }
  | {
      status: "error";
      fieldErrors: VisitNoteFieldErrors;
      formError?: "notFound" | "customerNotFound" | "caseNotFound" | "unknown";
    };

const KNOWN_CODES = new Set(["soapRequired", "tooLong", "painOutOfRange", "dateInvalid"]);

/** First error per field as an i18n key ("invalid" for anything unexpected). */
export function visitNoteFieldErrors(error: z.ZodError): VisitNoteFieldErrors {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field !== "string" || result[field] !== undefined) continue;
    result[field] = KNOWN_CODES.has(issue.message) ? issue.message : "invalid";
  }
  return result;
}

// Compile-time guard: the parsed output must match the published input type.
type Assert<T extends true> = T;
export type _SchemaTypesMatch = [
  Assert<z.output<typeof visitNoteSchema> extends VisitNoteInput ? true : false>,
];
