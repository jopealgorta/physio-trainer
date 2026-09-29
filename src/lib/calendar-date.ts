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
