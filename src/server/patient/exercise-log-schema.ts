import { z } from "zod";

import { isCalendarDate } from "@/lib/calendar-date";
import {
  LOG_COMMENT_MAX,
  PAIN_MAX,
  PAIN_MIN,
  RPE_MAX,
  RPE_MIN,
  WEIGHT_MAX,
  normalizeComment,
} from "@/lib/session-logs";

/**
 * What a patient sends when logging one exercise of a routine. Every id is only ever matched
 * against what the resolved link can reach. All four measures null means "clear this log".
 */
export const logExerciseSchema = z.object({
  routineId: z.uuid(),
  entryId: z.uuid().nullable(),
  exerciseId: z.uuid(),
  performedOn: z.string().refine(isCalendarDate),
  pain: z.number().int().min(PAIN_MIN).max(PAIN_MAX).nullable(),
  rpe: z.number().int().min(RPE_MIN).max(RPE_MAX).nullable(),
  weightKg: z
    .number()
    .min(0)
    .max(WEIGHT_MAX)
    .nullable()
    .transform((v) => (v === null ? null : Math.round(v * 10) / 10)),
  comment: z
    .string()
    .nullable()
    .transform(normalizeComment)
    .pipe(z.string().max(LOG_COMMENT_MAX).nullable()),
});

export type LogExerciseInput = z.output<typeof logExerciseSchema>;
