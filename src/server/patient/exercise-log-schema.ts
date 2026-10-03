import { z } from "zod";

import { isCalendarDate } from "@/lib/calendar-date";
import {
  LOG_COMMENT_MAX,
  RPE_MAX,
  RPE_MIN,
  SET_WEIGHTS_MAX,
  WEIGHT_MAX,
  normalizeComment,
  normalizeSetWeights,
} from "@/lib/session-logs";

/**
 * What a patient sends when logging one exercise of a routine. Every id is only ever matched
 * against what the resolved link can reach. Effort, set weights and comment all null means "clear this log".
 */
export const logExerciseSchema = z.object({
  routineId: z.uuid(),
  entryId: z.uuid().nullable(),
  exerciseId: z.uuid(),
  performedOn: z.string().refine(isCalendarDate),
  rpe: z.number().int().min(RPE_MIN).max(RPE_MAX).nullable(),
  setWeightsKg: z
    .array(z.number().min(0).max(WEIGHT_MAX).nullable())
    .max(SET_WEIGHTS_MAX)
    .nullable()
    .transform(normalizeSetWeights),
  comment: z
    .string()
    .nullable()
    .transform(normalizeComment)
    .pipe(z.string().max(LOG_COMMENT_MAX).nullable()),
});

export type LogExerciseInput = z.output<typeof logExerciseSchema>;
