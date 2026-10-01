// Imported by server code, client components and tests: no server-only modules.
import { todayIn } from "./calendar-date";

/** The one definition of "when is a routine or plan in effect" (spec 08). */
export type Schedulable = {
  status: "draft" | "active" | "archived";
  /** `YYYY-MM-DD`, null = no lower bound. */
  startsOn: string | null;
  /** `YYYY-MM-DD`, inclusive, null = no upper bound. */
  endsOn: string | null;
};

/**
 * - `active`: status active and the window includes the day.
 * - `upcoming`: status active, starts after the day.
 * - `ended`: status active, ended before the day.
 * - `inactive`: draft or archived, whatever the dates say.
 */
export type ScheduleState = "active" | "upcoming" | "ended" | "inactive";

/** State of an item on a calendar day (`YYYY-MM-DD`, compared as strings). */
export function scheduleState(item: Schedulable, date: string): ScheduleState {
  if (item.status !== "active") return "inactive";
  if (item.startsOn !== null && item.startsOn > date) return "upcoming";
  if (item.endsOn !== null && item.endsOn < date) return "ended";
  return "active";
}

/** True when the patient should do this on `date`: what the patient page, dashboard and exports use. */
export const isActiveOn = (item: Schedulable, date: string): boolean =>
  scheduleState(item, date) === "active";

/** State right now, where "today" is the calendar day in `timeZone` (the physio's). */
export const scheduleStateNow = (
  item: Schedulable,
  timeZone: string,
  now: Date = new Date(),
): ScheduleState => scheduleState(item, todayIn(timeZone, now));

/** Earliest start date after `date` among the active items, or null (patient empty state). */
export function nextStart(items: readonly Schedulable[], date: string): string | null {
  let next: string | null = null;
  for (const item of items) {
    if (scheduleState(item, date) !== "upcoming") continue;
    if (next === null || item.startsOn! < next) next = item.startsOn;
  }
  return next;
}
