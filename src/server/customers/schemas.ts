import { z } from "zod";

import {
  type BodySide,
  bodySideSchema,
  type CaseBodyArea,
  caseBodyAreaSchema,
} from "@/lib/body-areas";
import { isCalendarDate } from "@/lib/calendar-date";
import {
  ACTIVITY_MAX,
  CASE_NOTES_MAX,
  CASE_TITLE_MAX,
  CUSTOMER_SEXES,
  type CustomerSex,
  DIAGNOSIS_MAX,
  EMAIL_MAX,
  FIRST_NAME_MAX,
  GOALS_MAX,
  LAST_NAME_MAX,
  MEDICAL_HISTORY_MAX,
  OCCUPATION_MAX,
  PHONE_MAX,
  PRECAUTIONS_MAX,
} from "@/lib/customers";
import { type Locale, locales } from "@/i18n/config";

/** Mutation/action result. Errors are i18n keys. */
export type Result<T, E extends string> = { ok: true; data: T } | { ok: false; error: E };

export const idSchema = z.uuid();

/** Blank (or absent) form values become null. */
const blankToNull = (value: unknown) => {
  const text = typeof value === "string" ? value.trim() : value;
  return text === "" || text == null ? null : text;
};

/** Optional trimmed text: blank → null, longer than `max` → `code`. */
const optionalText = (max: number, code: string) =>
  z
    .preprocess((value) => value ?? "", z.string())
    .transform((value) => value.trim())
    .pipe(z.string().max(max, code))
    .transform((value) => value || null);

const requiredName = (max: number) =>
  z.preprocess(
    (value) => value ?? "",
    z.string().trim().min(1, "nameRequired").max(max, "nameTooLong"),
  );

const optionalDate = z.preprocess(
  blankToNull,
  z.string("dateInvalid").refine(isCalendarDate, "dateInvalid").nullable(),
);

const optionalEnum = <T extends z.ZodType>(schema: T, code: string) =>
  z.preprocess(blankToNull, z.union([z.null(), schema], { error: code }));

const email = z
  .preprocess((value) => value ?? "", z.string())
  .transform((value) => value.trim().toLowerCase())
  .pipe(
    z.union([z.literal(""), z.email("emailInvalid").max(EMAIL_MAX, "emailInvalid")], {
      error: "emailInvalid",
    }),
  )
  .transform((value) => value || null);

export const customerSchema = z.object({
  firstName: requiredName(FIRST_NAME_MAX),
  lastName: z
    .preprocess((value) => value ?? "", z.string())
    .transform((value) => value.trim())
    .pipe(z.string().max(LAST_NAME_MAX, "nameTooLong"))
    .transform((value) => value || null),
  email,
  phone: optionalText(PHONE_MAX, "phoneTooLong"),
  dateOfBirth: optionalDate,
  sex: optionalEnum(z.enum(CUSTOMER_SEXES), "sexInvalid"),
  occupation: optionalText(OCCUPATION_MAX, "tooLong"),
  activity: optionalText(ACTIVITY_MAX, "tooLong"),
  medicalHistory: optionalText(MEDICAL_HISTORY_MAX, "tooLong"),
  locale: optionalEnum(z.enum(locales), "localeInvalid"),
});
export type CustomerInput = {
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  sex: CustomerSex | null;
  occupation: string | null;
  activity: string | null;
  medicalHistory: string | null;
  locale: Locale | null;
};

const initialPain = z.preprocess(
  blankToNull,
  z.union(
    [
      z.null(),
      z.coerce
        .number({ error: "painOutOfRange" })
        .int("painOutOfRange")
        .min(0, "painOutOfRange")
        .max(10, "painOutOfRange"),
    ],
    { error: "painOutOfRange" },
  ),
);

export const caseSchema = z
  .object({
    title: requiredName(CASE_TITLE_MAX),
    diagnosis: optionalText(DIAGNOSIS_MAX, "tooLong"),
    bodyArea: optionalEnum(caseBodyAreaSchema, "bodyAreaInvalid"),
    side: optionalEnum(bodySideSchema, "invalid"),
    injuryOn: optionalDate,
    surgeryOn: optionalDate,
    precautions: optionalText(PRECAUTIONS_MAX, "tooLong"),
    goals: optionalText(GOALS_MAX, "tooLong"),
    initialPain: initialPain,
    notes: optionalText(CASE_NOTES_MAX, "tooLong"),
    openedOn: optionalDate,
  })
  .superRefine((value, ctx) => {
    if (value.side !== null && value.bodyArea === null) {
      ctx.addIssue({ code: "custom", path: ["side"], message: "sideNeedsArea" });
    }
  });
export type CaseInput = {
  title: string;
  diagnosis: string | null;
  bodyArea: CaseBodyArea | null;
  side: BodySide | null;
  injuryOn: string | null;
  surgeryOn: string | null;
  precautions: string | null;
  goals: string | null;
  initialPain: number | null;
  notes: string | null;
  openedOn: string | null;
};

export const closeCaseSchema = z.object({ id: z.uuid(), closedOn: optionalDate });
export type CloseCaseInput = { id: string; closedOn: string | null };

export type CustomerField = keyof CustomerInput;
export type CaseField = keyof CaseInput;
export type CustomerFieldErrors = Partial<Record<CustomerField, string>>;
export type CaseFieldErrors = Partial<Record<CaseField | "closedOn", string>>;

export type CustomerFormState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "error"; fieldErrors: CustomerFieldErrors; formError?: "notFound" | "unknown" };
export type CaseFormState =
  | { status: "idle" }
  | { status: "saved" }
  | {
      status: "error";
      fieldErrors: CaseFieldErrors;
      formError?: "notFound" | "customerNotFound" | "unknown";
    };

/** FormData → plain object for the schemas. Ids come from the action's bound arguments. */
export function formValues(formData: FormData): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [key, value] of formData) {
    if (key !== "id" && key !== "customerId") values[key] = value;
  }
  return values;
}

const KNOWN_CODES = new Set([
  "nameRequired",
  "nameTooLong",
  "emailInvalid",
  "phoneTooLong",
  "dateInvalid",
  "sexInvalid",
  "localeInvalid",
  "tooLong",
  "painOutOfRange",
  "bodyAreaInvalid",
  "sideNeedsArea",
]);

/** First error per field as an i18n key ("invalid" for anything unexpected). */
function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field !== "string" || result[field] !== undefined) continue;
    result[field] = KNOWN_CODES.has(issue.message) ? issue.message : "invalid";
  }
  return result;
}

export const customerFieldErrors = (error: z.ZodError): CustomerFieldErrors => fieldErrors(error);
export const caseFieldErrors = (error: z.ZodError): CaseFieldErrors => fieldErrors(error);

// Compile-time guard: the parsed output must match the published input types.
type Assert<T extends true> = T;
export type _SchemaTypesMatch = [
  Assert<z.output<typeof customerSchema> extends CustomerInput ? true : false>,
  Assert<z.output<typeof caseSchema> extends CaseInput ? true : false>,
  Assert<z.output<typeof closeCaseSchema> extends CloseCaseInput ? true : false>,
];
