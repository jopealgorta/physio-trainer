import "server-only";

import { and, eq, gt, isNull, lt, or, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import type { Tx } from "@/db/rls";
import { physios } from "@/db/schema";
import { todayIn } from "@/lib/calendar-date";
import type { ScheduleState } from "@/lib/schedule";

type ScheduleColumns = { status: PgColumn; startsOn: PgColumn; endsOn: PgColumn };

/**
 * SQL form of `scheduleState` (src/lib/schedule.ts) for the three states a query can ask for.
 * `date` is a `YYYY-MM-DD` day; use `physioToday` for "today". Pass the table's own columns, e.g.
 * `scheduleFilter(routines, "active", today)`.
 */
export function scheduleFilter(
  columns: ScheduleColumns,
  state: Exclude<ScheduleState, "inactive">,
  date: string,
): SQL {
  const isActive = eq(columns.status, "active");
  switch (state) {
    case "active":
      return and(
        isActive,
        or(isNull(columns.startsOn), lt(columns.startsOn, date), eq(columns.startsOn, date)),
        or(isNull(columns.endsOn), gt(columns.endsOn, date), eq(columns.endsOn, date)),
      )!;
    case "upcoming":
      return and(isActive, gt(columns.startsOn, date))!;
    case "ended":
      return and(isActive, lt(columns.endsOn, date))!;
  }
}

/** Today's calendar day in the physio's time zone (their profile), the "D" of "active on D". */
export async function physioToday(
  tx: Tx,
  physioId: string,
  now: Date = new Date(),
): Promise<string> {
  const [row] = await tx
    .select({ timezone: physios.timezone })
    .from(physios)
    .where(eq(physios.id, physioId));
  return todayIn(row?.timezone ?? "UTC", now);
}
