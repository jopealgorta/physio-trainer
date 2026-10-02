// Imported by the Drizzle schema via a relative path: keep this file free of "@/" imports
// and server-only modules.
import { isoWeekday } from "./calendar-date";
import { addDays } from "./phases";
import { WEEKDAYS } from "./plans";

/** Session log limits and pure helpers shared by the schema, the action and the UI (spec 13). */
export const LOG_COMMENT_MAX = 1000;
/** The Activity tab's comments feed shows this many of the newest comments. */
export const COMMENTS_LIMIT = 50;
export const PAIN_MIN = 0;
export const PAIN_MAX = 10;
/** 0..10, the values of the patient's pain control. */
export const PAIN_SCALE = Array.from({ length: PAIN_MAX - PAIN_MIN + 1 }, (_, i) => i + PAIN_MIN);

/** The days a patient may still log, oldest first: yesterday and today (the physio's days). */
export function loggableDates(today: string): [string, string] {
  return [addDays(today, -1), today];
}

export const isLoggableDate = (date: string, today: string): boolean =>
  loggableDates(today).includes(date);

/**
 * The date a weekday of the patient page's strip stands for: its day in the current
 * Monday-Sunday week. On a Monday, Sunday means yesterday instead of next Sunday (a plan repeats
 * weekly, so it shows the same content) so that yesterday can always be logged.
 */
export function dateForWeekday(today: string, weekday: number): string {
  const monday = addDays(today, -(isoWeekday(today) - 1));
  const date = addDays(monday, weekday - 1);
  const yesterday = addDays(today, -1);
  return date > today && weekday === isoWeekday(yesterday) ? yesterday : date;
}

/** Trimmed comment, null when blank. Length is validated separately (`LOG_COMMENT_MAX`). */
export function normalizeComment(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/** The days the patient page needs logs for: its week, plus yesterday when that is last week's Sunday. */
export function weekLogRange(today: string): [from: string, to: string] {
  const monday = addDays(today, -(isoWeekday(today) - 1));
  const yesterday = addDays(today, -1);
  return [monday < yesterday ? monday : yesterday, addDays(monday, 6)];
}

/** Weekdays of the page's week (see `dateForWeekday`) that have a completed session logged. */
export function loggedWeekdays(
  today: string,
  logs: readonly { performedOn: string; completed: boolean }[],
): number[] {
  const doneOn = new Set(logs.filter((entry) => entry.completed).map((entry) => entry.performedOn));
  return WEEKDAYS.filter((weekday) => doneOn.has(dateForWeekday(today, weekday)));
}
