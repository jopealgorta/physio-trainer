import "server-only";

import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import type { Tx } from "@/db/rls";
import { exerciseLogs, sessionLogs } from "@/db/schema";

/**
 * The physio has seen these comments of the customer (spec 13): clears their "new" badges.
 * Only the given ids are marked, i.e. the ones the Activity tab actually showed, so a comment
 * that arrived since or fell outside the feed stays new. Returns how many it marked. Not an edit
 * of the log: `updated_at` ("recently active") only follows the patient's own columns.
 */
export async function markCommentsSeen(
  tx: Tx,
  physioId: string,
  customerId: string,
  ids: readonly string[],
  now: Date = new Date(),
): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await tx
    .update(sessionLogs)
    .set({ seenByPhysioAt: now })
    .where(
      and(
        eq(sessionLogs.physioId, physioId),
        eq(sessionLogs.customerId, customerId),
        inArray(sessionLogs.id, [...ids]),
        isNotNull(sessionLogs.comment),
        isNull(sessionLogs.seenByPhysioAt),
      ),
    )
    .returning({ id: sessionLogs.id });
  return rows.length;
}

/** Same as `markCommentsSeen`, for the comments on single exercises (spec 19). */
export async function markExerciseCommentsSeen(
  tx: Tx,
  physioId: string,
  customerId: string,
  ids: readonly string[],
  now: Date = new Date(),
): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await tx
    .update(exerciseLogs)
    .set({ seenByPhysioAt: now })
    .where(
      and(
        eq(exerciseLogs.physioId, physioId),
        eq(exerciseLogs.customerId, customerId),
        inArray(exerciseLogs.id, [...ids]),
        isNotNull(exerciseLogs.comment),
        isNull(exerciseLogs.seenByPhysioAt),
      ),
    )
    .returning({ id: exerciseLogs.id });
  return rows.length;
}
