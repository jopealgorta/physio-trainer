// Imported by server code, client components and tests: keep this file free of "@/" imports
// and server-only modules.

export const PLAN_NAME_MAX = 80;
export const PLAN_NOTES_MAX = 2000;
export const ENTRY_LABEL_MAX = 40;
/** A note on one weekday of a plan ("Easy day"). */
export const DAY_NOTES_MAX = 500;
/** Routines a single day of a plan can hold. */
export const MAX_ENTRIES_PER_DAY = 6;
export const PLANS_LIST_LIMIT = 500;

/** ISO weekdays: 1 = Monday … 7 = Sunday. The board always starts on Monday. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const isWeekday = (value: unknown): value is Weekday =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 7;

/** A weekday's name in the active locale ("Monday", "lunes"; "M", "L" when narrow). */
export function weekdayName(
  locale: string,
  weekday: Weekday,
  style: "long" | "short" | "narrow" = "long",
): string {
  // 1 January 2024 was a Monday, so day-of-month equals the ISO weekday.
  return new Intl.DateTimeFormat(locale, { weekday: style, timeZone: "UTC" }).format(
    new Date(Date.UTC(2024, 0, weekday)),
  );
}

/** What the board needs to place an entry. Positions are 0-based within a weekday. */
export type PlacedEntry = { id: string; weekday: number; position: number };

/** Entries of each weekday, ordered by position. Index 0 is Monday, 6 is Sunday. */
export function groupByDay<T extends PlacedEntry>(entries: readonly T[]): T[][] {
  const days: T[][] = WEEKDAYS.map(() => []);
  for (const entry of entries) {
    if (isWeekday(entry.weekday)) days[entry.weekday - 1].push(entry);
  }
  for (const day of days) day.sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1));
  return days;
}

/** Flattens day lists back into entries with positions rewritten as 0…n-1 within each day. */
function flatten<T extends PlacedEntry>(days: readonly (readonly T[])[]): T[] {
  return days.flatMap((day, dayIndex) =>
    day.map((entry, position) => ({ ...entry, weekday: dayIndex + 1, position })),
  );
}

/** Rewrites positions as 0…n-1 within each day, keeping the current order. */
export const normalizeEntries = <T extends PlacedEntry>(entries: readonly T[]): T[] =>
  flatten(groupByDay(entries));

/** True when another entry fits on the day. */
export const dayHasRoom = (entries: readonly PlacedEntry[], weekday: number): boolean =>
  entries.filter((entry) => entry.weekday === weekday).length < MAX_ENTRIES_PER_DAY;

/**
 * Moves an entry to `weekday` at `index` (clamped to the day's length). Returns the whole list
 * with positions rewritten, or null when the entry is unknown, the weekday is invalid or the
 * target day is full (only checked when the day changes).
 */
export function moveEntry<T extends PlacedEntry>(
  entries: readonly T[],
  id: string,
  weekday: number,
  index: number,
): T[] | null {
  if (!isWeekday(weekday)) return null;
  const days = groupByDay(entries);
  const source = entries.find((entry) => entry.id === id);
  if (!source) return null;
  const sameDay = source.weekday === weekday;
  if (!sameDay && days[weekday - 1].length >= MAX_ENTRIES_PER_DAY) return null;

  const without = days.map((day) => day.filter((entry) => entry.id !== id));
  const target = [...without[weekday - 1]];
  const at = Math.max(0, Math.min(Math.trunc(index), target.length));
  target.splice(at, 0, { ...source, weekday });
  without[weekday - 1] = target;
  return flatten(without);
}

/**
 * Adds a copy of an entry (same routine) at the end of `weekday` under `newId`. Returns null
 * when the entry is unknown, the weekday is invalid or the day is full.
 */
export function copyEntry<T extends PlacedEntry>(
  entries: readonly T[],
  id: string,
  weekday: number,
  newId: string,
): T[] | null {
  if (!isWeekday(weekday)) return null;
  const source = entries.find((entry) => entry.id === id);
  if (!source || !dayHasRoom(entries, weekday)) return null;
  const days = groupByDay(entries);
  days[weekday - 1] = [...days[weekday - 1], { ...source, id: newId, weekday }];
  return flatten(days);
}

/** Appends a new entry to a weekday. Null when the weekday is invalid or the day is full. */
export function appendEntry<T extends PlacedEntry>(entries: readonly T[], entry: T): T[] | null {
  if (!isWeekday(entry.weekday) || !dayHasRoom(entries, entry.weekday)) return null;
  const days = groupByDay(entries);
  days[entry.weekday - 1] = [...days[entry.weekday - 1], entry];
  return flatten(days);
}

/** The ids whose weekday or position differ between two arrangements of the same entries. */
export function changedEntries<T extends PlacedEntry>(
  before: readonly T[],
  after: readonly T[],
): T[] {
  const old = new Map(before.map((entry) => [entry.id, entry]));
  return after.filter((entry) => {
    const prev = old.get(entry.id);
    return !prev || prev.weekday !== entry.weekday || prev.position !== entry.position;
  });
}

export type WeekSummary = {
  /** Routines scheduled on each weekday, index 0 = Monday. */
  sessionsPerDay: number[];
  totalSessions: number;
  /** Exercises across every scheduled routine (a routine on two days counts twice). */
  totalExercises: number;
  /** Days with at least one routine. */
  activeDays: number;
};

export function summarizeWeek(
  entries: readonly { weekday: number; exerciseCount: number }[],
): WeekSummary {
  const sessionsPerDay = WEEKDAYS.map(() => 0);
  let totalExercises = 0;
  for (const entry of entries) {
    if (!isWeekday(entry.weekday)) continue;
    sessionsPerDay[entry.weekday - 1] += 1;
    totalExercises += entry.exerciseCount;
  }
  const totalSessions = sessionsPerDay.reduce((sum, count) => sum + count, 0);
  return {
    sessionsPerDay,
    totalSessions,
    totalExercises,
    activeDays: sessionsPerDay.filter((count) => count > 0).length,
  };
}
