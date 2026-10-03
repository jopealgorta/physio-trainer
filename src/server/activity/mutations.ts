import "server-only";

import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import type { Tx } from "@/db/rls";
import { exerciseLogs, sessionLogs } from "@/db/schema";

type CommentTable = typeof sessionLogs | typeof exerciseLogs;

/**
 * Marks the given logs of the customer as seen, for either log table (same columns: physio,
 * customer, comment, seen-at). Only the given ids are touched, only unseen logs with a comment.
 */
async function markSeen(
  tx: Tx,
  table: CommentTable,
  physioId: string,
  customerId: string,
  ids: readonly string[],
  now: Date,
): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await tx
    .update(table)
    .set({ seenByPhysioAt: now })
    .where(
      and(
        eq(table.physioId, physioId),
        eq(table.customerId, customerId),
        inArray(table.id, [...ids]),
        isNotNull(table.comment),
        isNull(table.seenByPhysioAt),
      ),
    )
    .returning({ id: table.id });
  return rows.length;
}

/**
 * The physio has seen these comments of the customer (spec 13): clears their "new" badges.
 * Only the given ids are marked, i.e. the ones the Activity tab actually showed, so a comment
 * that arrived since or fell outside the feed stays new. Returns how many it marked. Not an edit
 * of the log: `updated_at` ("recently active") only follows the patient's own columns.
 */
export const markCommentsSeen = (
  tx: Tx,
  physioId: string,
  customerId: string,
  ids: readonly string[],
  now: Date = new Date(),
) => markSeen(tx, sessionLogs, physioId, customerId, ids, now);

/** Same as `markCommentsSeen`, for the comments on single exercises (spec 19). */
export const markExerciseCommentsSeen = (
  tx: Tx,
  physioId: string,
  customerId: string,
  ids: readonly string[],
  now: Date = new Date(),
) => markSeen(tx, exerciseLogs, physioId, customerId, ids, now);
