import { z } from "zod";

import { isCalendarDate } from "@/lib/calendar-date";
import { LOG_COMMENT_MAX, PAIN_MAX, PAIN_MIN, normalizeComment } from "@/lib/session-logs";

/**
 * What a patient sends when logging a session (spec 13). Every id is only ever matched against
 * what the resolved link can reach; `performedOn` is checked against the physio's today.
 */
export const logSessionSchema = z.object({
  routineId: z.uuid(),
  entryId: z.uuid().nullable(),
  performedOn: z.string().refine(isCalendarDate),
  completed: z.boolean(),
  pain: z.number().int().min(PAIN_MIN).max(PAIN_MAX).nullable(),
  comment: z
    .string()
    .nullable()
    .transform(normalizeComment)
    .pipe(z.string().max(LOG_COMMENT_MAX).nullable()),
});

export type LogSessionInput = z.output<typeof logSessionSchema>;
