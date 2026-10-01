const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Calendar day (`YYYY-MM-DD`) of `now` in `timeZone`. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Milliseconds `timeZone` is ahead of UTC at `instant`. */
function zoneOffsetMs(timeZone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(instant);
  const part = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );
  // formatToParts drops milliseconds, so compare against the instant truncated to seconds.
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The instant a calendar day ends in `timeZone`: midnight at the start of the following day.
 * Used for "expires on" dates, which stay valid through the whole chosen day.
 */
export function endOfDay(timeZone: string, day: string): Date {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  const wallClock = Date.UTC(year, month - 1, date + 1);
  // The offset depends on the instant, which depends on the offset: two passes settle it
  // (a third would only matter for zones that change offset within a day of midnight).
  let instant = wallClock - zoneOffsetMs(timeZone, new Date(wallClock));
  instant = wallClock - zoneOffsetMs(timeZone, new Date(instant));
  return new Date(instant);
}

/** The calendar day in `timeZone` that ends at `end` (inverse of `endOfDay`). */
export function lastDayBefore(timeZone: string, end: Date): string {
  return todayIn(timeZone, new Date(end.getTime() - 1));
}

/** A real calendar day written `YYYY-MM-DD`, year 1900 or later. */
export function isCalendarDate(value: string): boolean {
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < 1900) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** Completed years between `dob` and today in `timeZone`; null if `dob` is invalid or in the future. */
export function ageInYears(dob: string, timeZone: string, now: Date = new Date()): number | null {
  if (!isCalendarDate(dob)) return null;
  const today = todayIn(timeZone, now);
  if (dob > today) return null;
  const [by, bm, bd] = dob.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  // Compare (month, day) lexicographically: Feb 29 birthdays are reached on Mar 1 in common years.
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/**
 * A `YYYY-MM-DD` day as a Date at UTC midnight. Format it with `CALENDAR_DATE_FORMAT` (UTC) so
 * the day never shifts with the viewer's or the server's time zone.
 */
export function calendarDateToDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

/** Intl options for displaying a `calendarDateToDate` value. */
export const CALENDAR_DATE_FORMAT = { dateStyle: "medium", timeZone: "UTC" } as const;
