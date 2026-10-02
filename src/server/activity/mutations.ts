import "server-only";

import { and, eq, isNotNull, isNull } from "drizzle-orm";

import type { Tx } from "@/db/rls";
import { sessionLogs } from "@/db/schema";

/**
 * The physio has seen the customer's comments (spec 13): clears the "new" badge on every comment
 * of the customer that was not seen yet. Returns how many it marked. Not an edit of the log:
 * `updated_at` ("recently active") only follows the patient's own columns.
 */
export async function markCommentsSeen(
  tx: Tx,
  physioId: string,
  customerId: string,
  now: Date = new Date(),
): Promise<number> {
  const rows = await tx
    .update(sessionLogs)
    .set({ seenByPhysioAt: now })
    .where(
      and(
        eq(sessionLogs.physioId, physioId),
        eq(sessionLogs.customerId, customerId),
        isNotNull(sessionLogs.comment),
        isNull(sessionLogs.seenByPhysioAt),
      ),
    )
    .returning({ id: sessionLogs.id });
  return rows.length;
}
