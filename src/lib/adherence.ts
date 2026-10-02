import { isoWeekday } from "./calendar-date";
import { addDays } from "./phases";
import { isActiveOn, type Schedulable } from "./schedule";

/**
 * Adherence maths (spec 13): what was planned, what the patient logged, and how the two line up.
 * Pure: the server loads the facts (plans, routines, logs) and hands them over.
 *
 * Planned sessions come from the plans and routines as they are today, so editing a plan changes
 * how its past weeks read; phase windows (spec 08) keep an ended phase out of later weeks.
 */

/** An active-able plan with the entries whose routine is finished and the customer's own. */
export type PlanFact = Schedulable & {
  entries: { id: string; weekday: number; routineId: string }[];
};

/** A standalone routine and how often it should be done. */
export type SingleFact = Schedulable & {
  sessionsPerWeek: number | null;
  sessionsPerDay: number | null;
};

export type LogFact = {
  routineId: string;
  entryId: string | null;
  performedOn: string;
  completed: boolean;
  pain: number | null;
};

/** Every `YYYY-MM-DD` from `from` to `to`, inclusive. */
export function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) dates.push(day);
  return dates;
}

/** Plan entries scheduled for `date`: one planned session each. */
export function plannedOn(date: string, plans: readonly PlanFact[]): number {
  const weekday = isoWeekday(date);
  let count = 0;
  for (const plan of plans) {
    if (!isActiveOn(plan, date)) continue;
    count += plan.entries.filter((entry) => entry.weekday === weekday).length;
  }
  return count;
}

/**
 * Sessions per day of a single routine, pro-rated: `sessions_per_week` / 7 (a routine with only
 * `sessions_per_day` is daily). One log per routine per day is all a patient can leave, so the
 * per-day count does not multiply it. No frequency, nothing planned.
 */
function dailyRate(single: SingleFact): number {
  const perWeek = single.sessionsPerWeek ?? (single.sessionsPerDay !== null ? 7 : null);
  return perWeek === null ? 0 : perWeek / 7;
}

/** Planned sessions in `[from, to]`: plan entries per active day plus pro-rated single routines. */
export function plannedSessions(
  from: string,
  to: string,
  plans: readonly PlanFact[],
  singles: readonly SingleFact[],
): number {
  let planned = 0;
  for (const date of datesBetween(from, to)) {
    planned += plannedOn(date, plans);
    for (const single of singles) {
      if (isActiveOn(single, date)) planned += dailyRate(single);
    }
  }
  return planned;
}

export type Adherence = {
  planned: number;
  completed: number;
  /** completed / planned, at most 1; null when nothing was planned. */
  ratio: number | null;
};

export function adherence(
  from: string,
  to: string,
  plans: readonly PlanFact[],
  singles: readonly SingleFact[],
  logs: readonly LogFact[],
): Adherence {
  const planned = plannedSessions(from, to, plans, singles);
  const completed = logs.filter(
    (entry) => entry.completed && entry.performedOn >= from && entry.performedOn <= to,
  ).length;
  return { planned, completed, ratio: planned > 0 ? Math.min(1, completed / planned) : null };
}

/**
 * - `done`: everything planned that day was logged. `partial`: some of it.
 * - `missed`: planned, a past day, nothing logged. `planned`: today, nothing logged yet.
 * - `upcoming`: planned, a future day. `extra`: logged with nothing planned. `none`: neither.
 * A day's `completed` counts plan-entry logs when something is planned, every log otherwise.
 */
export type DayState = "done" | "partial" | "missed" | "planned" | "upcoming" | "extra" | "none";

export type DayCell = { date: string; state: DayState; planned: number; completed: number };

/** One cell per day of `[from, to]` for the heatmap; `today` splits missed from still to do. */
export function dayCells(
  from: string,
  to: string,
  today: string,
  plans: readonly PlanFact[],
  logs: readonly LogFact[],
): DayCell[] {
  // Planned sessions are plan entries, so only logs made from a plan entry answer them; a
  // standalone routine logged that day neither completes nor hides a missed entry.
  const planDone = new Map<string, number>();
  const anyDone = new Map<string, number>();
  for (const entry of logs) {
    if (!entry.completed) continue;
    anyDone.set(entry.performedOn, (anyDone.get(entry.performedOn) ?? 0) + 1);
    if (entry.entryId !== null) {
      planDone.set(entry.performedOn, (planDone.get(entry.performedOn) ?? 0) + 1);
    }
  }
  return datesBetween(from, to).map((date) => {
    const planned = plannedOn(date, plans);
    const completed = planned > 0 ? (planDone.get(date) ?? 0) : (anyDone.get(date) ?? 0);
    let state: DayState;
    if (planned > 0) {
      state =
        completed >= planned
          ? "done"
          : completed > 0
            ? "partial"
            : date < today
              ? "missed"
              : date === today
                ? "planned"
                : "upcoming";
    } else {
      state = completed > 0 ? "extra" : "none";
    }
    return { date, state, planned, completed };
  });
}

/** `count` Monday-first weeks (columns of 7 dates) ending with the week that holds `today`. */
export function heatmapWeeks(today: string, count: number): string[][] {
  const lastMonday = addDays(today, -(isoWeekday(today) - 1));
  return Array.from({ length: count }, (_, i) => {
    const monday = addDays(lastMonday, -7 * (count - 1 - i));
    return datesBetween(monday, addDays(monday, 6));
  });
}

export type PainPoint = { date: string; pain: number };

/** Average rating per day, oldest first; `routineId` follows one routine, null is overall. */
export function painSeries(logs: readonly LogFact[], routineId: string | null): PainPoint[] {
  const byDate = new Map<string, number[]>();
  for (const entry of logs) {
    if (entry.pain === null) continue;
    if (routineId !== null && entry.routineId !== routineId) continue;
    byDate.set(entry.performedOn, [...(byDate.get(entry.performedOn) ?? []), entry.pain]);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, ratings]) => ({
      date,
      pain: Math.round((ratings.reduce((sum, n) => sum + n, 0) / ratings.length) * 10) / 10,
    }));
}
