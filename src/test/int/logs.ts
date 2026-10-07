import { db } from "@/db";
import { sessionLogs } from "@/db/schema";

/** Owner-connection fixture: a session log (one per routine/entry/day), returns its id. */
export async function insertSessionLog(
  physioId: string,
  values: {
    customerId: string;
    routineId: string;
    performedOn: string;
    weeklyPlanEntryId?: string | null;
    completed?: boolean;
    pain?: number | null;
    rpe?: number | null;
    comment?: string | null;
  },
): Promise<string> {
  const [row] = await db
    .insert(sessionLogs)
    .values({ physioId, ...values })
    .returning({ id: sessionLogs.id });
  return row!.id;
}
