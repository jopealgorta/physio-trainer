import { z } from "zod";

import { BODY_AREAS } from "@/lib/body-areas";
import { EXERCISE_KINDS } from "@/lib/exercise-kinds";
import type { ExerciseRef } from "@/lib/routine-editor";
import {
  CATEGORY_NAME_MAX_LENGTH,
  EXERCISE_NAME_MAX_LENGTH,
  INSTRUCTIONS_MAX_LENGTH,
  MAX_CATEGORIES_PER_EXERCISE,
  MAX_MEDIA,
} from "@/lib/library-limits";
import { parseYouTubeUrl, type YouTubeVideo } from "@/lib/youtube";

/** Mutation/action result. Errors are i18n keys. */
export type Result<T, E extends string> = { ok: true; data: T } | { ok: false; error: E };

export {
  CATEGORY_NAME_MAX_LENGTH,
  EXERCISE_NAME_MAX_LENGTH,
  INSTRUCTIONS_MAX_LENGTH,
  MAX_CATEGORIES_PER_EXERCISE,
  MAX_MEDIA,
};

export const idSchema = z.uuid();

const categoryName = z
  .string()
  .trim()
  .min(1, "nameRequired")
  .max(CATEGORY_NAME_MAX_LENGTH, "nameTooLong");

export const createCategorySchema = z.object({ name: categoryName, parentId: z.uuid().nullable() });
export const renameCategorySchema = z.object({ id: z.uuid(), name: categoryName });
export const reorderCategoriesSchema = z.object({
  parentId: z.uuid().nullable(),
  orderedIds: z
    .array(z.uuid())
    .min(1)
    .max(500)
    .refine((ids) => new Set(ids).size === ids.length),
});
export type CreateCategoryInput = z.output<typeof createCategorySchema>;
export type RenameCategoryInput = z.output<typeof renameCategorySchema>;
export type ReorderCategoriesInput = z.output<typeof reorderCategoriesSchema>;

export type CategoryError =
  | "nameRequired"
  | "nameTooLong"
  | "nameTaken"
  | "notFound"
  | "parentNotFound"
  | "tooDeep"
  | "mismatch"
  | "invalid";

export function categoryInputError(error: z.ZodError): CategoryError {
  const message = error.issues[0]?.message;
  return message === "nameRequired" || message === "nameTooLong" ? message : "invalid";
}

const stringList = z.array(z.string());
const BODY_AREA_ORDER = new Map(BODY_AREAS.map((area, index) => [area, index]));

export const exerciseSchema = z.object({
  name: z.string().trim().min(1, "nameRequired").max(EXERCISE_NAME_MAX_LENGTH, "nameTooLong"),
  kind: z.enum(EXERCISE_KINDS).default("strength"),
  categoryIds: z
    .preprocess(
      (value) => (Array.isArray(value) ? value.filter((id) => id !== "") : value),
      z.array(z.uuid("categoryInvalid"), "categoryInvalid"),
    )
    .transform((ids) => [...new Set(ids)])
    .pipe(z.array(z.string()).max(MAX_CATEGORIES_PER_EXERCISE, "tooManyCategories")),
  instructions: z
    .preprocess((value) => value ?? "", z.string("instructionsTooLong"))
    .transform((value) => value.trim())
    .pipe(z.string().max(INSTRUCTIONS_MAX_LENGTH, "instructionsTooLong"))
    .transform((value) => value || null),
  bodyAreas: z
    .array(z.enum(BODY_AREAS, { error: "bodyAreasInvalid" }), "bodyAreasInvalid")
    .transform((areas) =>
      [...new Set(areas)].sort((a, b) => BODY_AREA_ORDER.get(a)! - BODY_AREA_ORDER.get(b)!),
    ),
  media: stringList.max(MAX_MEDIA, "tooManyMedia").transform((urls, ctx): YouTubeVideo[] => {
    const videos = urls.map(parseYouTubeUrl);
    const ids = videos.map((video) => video?.videoId);
    if (videos.some((video) => video === null) || new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", message: "mediaInvalid" });
      return z.NEVER;
    }
    return videos as YouTubeVideo[];
  }),
});

export type ExerciseInput = z.output<typeof exerciseSchema>;

const LIST_FIELDS = ["categoryIds", "bodyAreas", "media"] as const;

/** FormData → plain object for exerciseSchema (list fields use repeated names). */
export function exerciseFormValues(formData: FormData): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [key, value] of formData) {
    if (!(LIST_FIELDS as readonly string[]).includes(key)) values[key] = value;
  }
  for (const key of LIST_FIELDS) values[key] = formData.getAll(key);
  return values;
}

export type ExerciseField =
  "name" | "kind" | "categoryIds" | "instructions" | "bodyAreas" | "media";
export type ExerciseFieldErrors = Partial<Record<ExerciseField, string>>;

const KNOWN_CODES = new Set([
  "nameRequired",
  "nameTooLong",
  "categoryInvalid",
  "tooManyCategories",
  "instructionsTooLong",
  "bodyAreasInvalid",
  "tooManyMedia",
  "mediaInvalid",
  "notAWholeNumber",
  "outOfRange",
  "tooLong",
  "invalidSide",
  "repsMaxWithoutReps",
  "repsMaxNotAboveReps",
]);

/** First error per field as an i18n key ("invalid" for anything unexpected). */
export function exerciseFieldErrors(error: z.ZodError): ExerciseFieldErrors {
  const result: ExerciseFieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as ExerciseField | undefined;
    if (field === undefined || result[field] !== undefined) continue;
    result[field] = KNOWN_CODES.has(issue.message) ? issue.message : "invalid";
  }
  return result;
}

export type ExerciseFormState =
  | { status: "idle" }
  /** Created from the routine editor, which adds it to the routine. */
  | { status: "created"; exercise: ExerciseRef }
  | { status: "error"; fieldErrors: ExerciseFieldErrors; formError?: "notFound" | "unknown" };
