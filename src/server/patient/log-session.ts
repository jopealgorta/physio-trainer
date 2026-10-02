import "server-only";

import { and, asc, between, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { sessionLogs, weeklyPlanEntries } from "@/db/schema";
import { todayIn } from "@/lib/calendar-date";
import { isLoggableDate } from "@/lib/session-logs";

import type { LogSessionInput } from "./log-schema";
import type { ActiveLink, LinkShell } from "./resolve-link";
import { isReachable } from "./view";

export type { LogSessionInput };

/** A log as the patient sees it back: nothing about the physio's side (seen state, ids). */
export type PatientLog = {
  routineId: string;
  entryId: string | null;
  performedOn: string;
  completed: boolean;
  pain: number | null;
  comment: string | null;
};

export type LogSessionResult =
  { ok: true; data: PatientLog } | { ok: false; error: "date" | "unreachable" };

/**
 * Saves (or edits) the log of one routine on one day (spec 13). The link is already resolved and
 * unlocked; the customer, physio and link ids come from it. The routine and plan entry come from
 * the request, so they must be reachable from the link and active on `performedOn`, and the day
 * must be today or yesterday in the physio's time zone. One row per routine, entry and day:
 * saving again edits it.
 */
export async function logSession(
  shell: Pick<LinkShell, "physioId" | "timeZone">,
  link: Pick<ActiveLink, "id" | "target" | "customerId" | "routineId" | "weeklyPlanId">,
  input: LogSessionInput,
  now: Date = new Date(),
): Promise<LogSessionResult> {
  if (!isLoggableDate(input.performedOn, todayIn(shell.timeZone, now))) {
    return { ok: false, error: "date" };
  }
  const reachable = await isReachable(
    shell,
    link,
    { routineId: input.routineId, entryId: input.entryId },
    input.performedOn,
  );
  if (!reachable) return { ok: false, error: "unreachable" };

  const [row] = await db
    .insert(sessionLogs)
    .values({
      physioId: shell.physioId,
      customerId: link.customerId,
      shareLinkId: link.id,
      routineId: input.routineId,
      weeklyPlanEntryId: input.entryId,
      performedOn: input.performedOn,
      completed: input.completed,
      pain: input.pain,
      comment: input.comment,
    })
    .onConflictDoUpdate({
      target: [sessionLogs.routineId, sessionLogs.weeklyPlanEntryId, sessionLogs.performedOn],
      set: {
        shareLinkId: link.id,
        completed: input.completed,
        pain: input.pain,
        comment: input.comment,
        // A changed comment is news for the physio again; the same words are not.
        seenByPhysioAt: sql`case when ${sessionLogs.comment} is not distinct from excluded.comment
          then ${sessionLogs.seenByPhysioAt} else null end`,
      },
    })
    .returning({
      routineId: sessionLogs.routineId,
      entryId: sessionLogs.weeklyPlanEntryId,
      performedOn: sessionLogs.performedOn,
      completed: sessionLogs.completed,
      pain: sessionLogs.pain,
      comment: sessionLogs.comment,
    });
  return { ok: true, data: row! };
}

/**
 * The logs a link may show the patient between two days: the customer's own, narrowed to the
 * routine or plan a single-target link points at.
 */
export async function getPatientLogs(
  shell: Pick<LinkShell, "physioId">,
  link: Pick<ActiveLink, "target" | "customerId" | "routineId" | "weeklyPlanId">,
  from: string,
  to: string,
): Promise<PatientLog[]> {
  return db
    .select({
      routineId: sessionLogs.routineId,
      entryId: sessionLogs.weeklyPlanEntryId,
      performedOn: sessionLogs.performedOn,
      completed: sessionLogs.completed,
      pain: sessionLogs.pain,
      comment: sessionLogs.comment,
    })
    .from(sessionLogs)
    .where(
      and(
        eq(sessionLogs.physioId, shell.physioId),
        eq(sessionLogs.customerId, link.customerId),
        between(sessionLogs.performedOn, from, to),
        link.target === "routine" ? eq(sessionLogs.routineId, link.routineId!) : undefined,
        link.target === "weekly_plan"
          ? inArray(
              sessionLogs.weeklyPlanEntryId,
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
      ),
    )
    .orderBy(asc(sessionLogs.performedOn), asc(sessionLogs.routineId), asc(sessionLogs.createdAt));
}
