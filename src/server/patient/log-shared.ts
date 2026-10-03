import "server-only";

import { and, between, eq, inArray, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { exerciseLogs, sessionLogs, weeklyPlanEntries } from "@/db/schema";
import { todayIn } from "@/lib/calendar-date";
import { isLoggableDate } from "@/lib/session-logs";

import type { ActiveLink, LinkShell } from "./resolve-link";
import { isReachable } from "./view";

/** Tables a patient writes to through a link; they share these columns. */
type LogTable = typeof sessionLogs | typeof exerciseLogs;

/**
 * The write preamble every patient log shares: the day must be today or yesterday in the
 * physio's time zone, and the routine/entry must be reachable from the link on that day.
 */
export async function checkLoggable(
  shell: Pick<LinkShell, "physioId" | "timeZone">,
  link: Pick<ActiveLink, "target" | "customerId" | "routineId" | "weeklyPlanId">,
  ref: { routineId: string; entryId: string | null },
  performedOn: string,
  now: Date,
): Promise<"date" | "unreachable" | null> {
  if (!isLoggableDate(performedOn, todayIn(shell.timeZone, now))) return "date";
  return (await isReachable(shell, link, ref, performedOn)) ? null : "unreachable";
}

/** A changed comment is news for the physio again; the same words are not. */
export const resetSeenOnNewComment = (table: LogTable): SQL =>
  sql`case when ${table.comment} is not distinct from excluded.comment
    then ${table.seenByPhysioAt} else null end`;

/**
 * What a link may read between two days: the customer's own rows, narrowed to the routine or
 * plan a single-target link points at.
 */
export function patientLogScope(
  table: LogTable,
  shell: Pick<LinkShell, "physioId">,
  link: Pick<ActiveLink, "target" | "customerId" | "routineId" | "weeklyPlanId">,
  from: string,
  to: string,
): SQL | undefined {
  return and(
    eq(table.physioId, shell.physioId),
    eq(table.customerId, link.customerId),
    between(table.performedOn, from, to),
    link.target === "routine" ? eq(table.routineId, link.routineId!) : undefined,
    link.target === "weekly_plan"
      ? inArray(
          table.weeklyPlanEntryId,
          db
            .select({ id: weeklyPlanEntries.id })
            .from(weeklyPlanEntries)
            .where(
              and(
                eq(weeklyPlanEntries.physioId, shell.physioId),
                eq(weeklyPlanEntries.weeklyPlanId, link.weeklyPlanId!),
              ),
            ),
        )
      : undefined,
  );
}
