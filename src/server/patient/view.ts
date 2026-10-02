import "server-only";

import { and, asc, eq, inArray, or, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { routines, weeklyPlanEntries, weeklyPlans } from "@/db/schema";
import { isoWeekday, todayIn } from "@/lib/calendar-date";
import { nextStart } from "@/lib/schedule";
import { loadRoutineContent } from "@/server/routines/content";
import type { ContentBlock, ContentItem, RoutineContent } from "@/server/routines/content";
import { scheduleFilter } from "@/server/schedule/active";

import type { ActiveLink, LinkShell } from "./resolve-link";

/**
 * What the patient page shows, and nothing else (spec 10, "Exposed to patients"): names, notes,
 * exercise instructions and media, prescription. No case details, history, visit notes, other
 * customers, last names or contact details of the customer.
 */
export type PatientItem = ContentItem;
export type PatientBlock = ContentBlock;
export type PatientRoutine = RoutineContent;

export type PatientPlan = {
  id: string;
  name: string;
  notes: string | null;
  /** The routines of the selected weekday, in order, with their entry label ("Morning"). */
  entries: { id: string; label: string | null; routine: PatientRoutine }[];
};

export type PatientView = {
  /** The physio's calendar day (`YYYY-MM-DD`). */
  today: string;
  todayWeekday: number;
  /** The weekday being shown (today unless the patient picked another). */
  weekday: number;
  plans: PatientPlan[];
  /** ISO weekdays that have something scheduled in any of the shown plans (for the day strip). */
  weekdaysWithContent: number[];
  /** Active single routines ("Your routines"), or the one a routine link points at. */
  routines: PatientRoutine[];
  /** When nothing is active: the day the earliest upcoming item starts, for the empty state. */
  nextStart: string | null;
};

/**
 * What a link may reach, as SQL: the plans and routines of its customer (narrowed to the one
 * routine or plan for a single-target link). Shared by the page and the workout route so both
 * answer "can this link see it?" the same way (and the export, spec 14).
 */
export function linkScopes(
  shell: Pick<LinkShell, "physioId">,
  link: Pick<ActiveLink, "target" | "customerId" | "routineId" | "weeklyPlanId">,
  today: string,
) {
  const planScope = (extra: SQL | undefined) =>
    and(
      eq(weeklyPlans.physioId, shell.physioId),
      eq(weeklyPlans.customerId, link.customerId),
      link.target === "weekly_plan" ? eq(weeklyPlans.id, link.weeklyPlanId!) : undefined,
      extra,
    );
  const routineScope = (extra: SQL | undefined) =>
    and(
      eq(routines.physioId, shell.physioId),
      eq(routines.customerId, link.customerId),
      link.target === "customer" ? eq(routines.isStandalone, true) : undefined,
      link.target === "routine" ? eq(routines.id, link.routineId!) : undefined,
      extra,
    );
  // A routine link also opens a routine that only lives inside a plan: its own window is ignored
  // there (spec 08), so being active is enough.
  const routineActive =
    link.target === "routine"
      ? or(
          scheduleFilter(routines, "active", today),
          and(eq(routines.isStandalone, false), eq(routines.status, "active")),
        )
      : scheduleFilter(routines, "active", today);

  return { planScope, routineScope, routineActive };
}

const isWeekdayNumber = (value: number) => Number.isInteger(value) && value >= 1 && value <= 7;

export async function getPatientView(
  shell: Pick<LinkShell, "physioId" | "timeZone">,
  link: Pick<ActiveLink, "target" | "customerId" | "routineId" | "weeklyPlanId">,
  requestedWeekday: number | null = null,
  now: Date = new Date(),
): Promise<PatientView> {
  const today = todayIn(shell.timeZone, now);
  const todayWeekday = isoWeekday(today);
  const weekday =
    requestedWeekday !== null && isWeekdayNumber(requestedWeekday)
      ? requestedWeekday
      : todayWeekday;

  // Every id below comes from the resolved link; the request only ever chose a weekday.
  const { planScope, routineScope, routineActive } = linkScopes(shell, link, today);

  const [planRows, routineRows] = await Promise.all([
    link.target === "routine"
      ? []
      : db
          .select({ id: weeklyPlans.id, name: weeklyPlans.name, notes: weeklyPlans.notes })
          .from(weeklyPlans)
          .where(planScope(scheduleFilter(weeklyPlans, "active", today)))
          .orderBy(asc(weeklyPlans.name), asc(weeklyPlans.id)),
    link.target === "weekly_plan"
      ? []
      : db
          .select({ id: routines.id })
          .from(routines)
          .where(routineScope(routineActive))
          .orderBy(asc(routines.name), asc(routines.id)),
  ]);

  const entryRows = planRows.length
    ? await db
        .select({
          id: weeklyPlanEntries.id,
          planId: weeklyPlanEntries.weeklyPlanId,
          weekday: weeklyPlanEntries.weekday,
          label: weeklyPlanEntries.label,
          routineId: weeklyPlanEntries.routineId,
        })
        .from(weeklyPlanEntries)
        .innerJoin(
          routines,
          and(
            eq(routines.physioId, weeklyPlanEntries.physioId),
            eq(routines.id, weeklyPlanEntries.routineId),
          ),
        )
        .where(
          and(
            eq(weeklyPlanEntries.physioId, shell.physioId),
            inArray(
              weeklyPlanEntries.weeklyPlanId,
              planRows.map((plan) => plan.id),
            ),
            // The routine must be the same customer's and finished: a draft or archived routine
            // is never shown, the same rule as when it is shared on its own.
            eq(routines.customerId, link.customerId),
            eq(routines.status, "active"),
          ),
        )
        .orderBy(asc(weeklyPlanEntries.weekday), asc(weeklyPlanEntries.position))
    : [];

  const weekdaysWithContent = [...new Set(entryRows.map((entry) => entry.weekday))].sort(
    (a, b) => a - b,
  );
  const dayEntries = entryRows.filter((entry) => entry.weekday === weekday);

  const content = await loadRoutineContent(db, shell.physioId, link.customerId, [
    ...new Set([...dayEntries.map((entry) => entry.routineId), ...routineRows.map((r) => r.id)]),
  ]);

  const plans: PatientPlan[] = planRows.map((plan) => ({
    ...plan,
    entries: dayEntries
      .filter((entry) => entry.planId === plan.id && content.has(entry.routineId))
      .map((entry) => ({
        id: entry.id,
        label: entry.label,
        routine: content.get(entry.routineId)!,
      })),
  }));
  const shownRoutines = routineRows
    .map((row) => content.get(row.id))
    .filter((routine): routine is PatientRoutine => routine !== undefined);

  let upcoming: string | null = null;
  if (planRows.length === 0 && routineRows.length === 0) {
    const [upcomingPlans, upcomingRoutines] = await Promise.all([
      link.target === "routine"
        ? []
        : db
            .select({
              status: weeklyPlans.status,
              startsOn: weeklyPlans.startsOn,
              endsOn: weeklyPlans.endsOn,
            })
            .from(weeklyPlans)
            .where(planScope(scheduleFilter(weeklyPlans, "upcoming", today))),
      link.target === "weekly_plan"
        ? []
        : db
            .select({
              status: routines.status,
              startsOn: routines.startsOn,
              endsOn: routines.endsOn,
            })
            .from(routines)
            .where(routineScope(scheduleFilter(routines, "upcoming", today))),
    ]);
    upcoming = nextStart([...upcomingPlans, ...upcomingRoutines], today);
  }

  return {
    today,
    todayWeekday,
    weekday,
    plans,
    weekdaysWithContent,
    routines: shownRoutines,
    nextStart: upcoming,
  };
}

type ReachShell = Pick<LinkShell, "physioId" | "timeZone">;
type ReachLink = Pick<ActiveLink, "target" | "customerId" | "routineId" | "weeklyPlanId">;

/**
 * Can this link reach `routineId` on `date`? One of the customer's active standalone routines, a
 * routine in an active plan entry of the link's customer, or the single routine or plan the link
 * points at. `entryId` narrows it to that plan entry (spec 13 logs per entry). The ids come from
 * the request, so they are only ever matched against what the link itself can reach.
 */
export async function isReachable(
  shell: Pick<LinkShell, "physioId">,
  link: ReachLink,
  target: { routineId: string; entryId?: string | null },
  date: string,
): Promise<boolean> {
  const { planScope, routineScope, routineActive } = linkScopes(shell, link, date);

  const [standalone, inPlan] = await Promise.all([
    link.target === "weekly_plan" || target.entryId
      ? []
      : db
          .select({ id: routines.id })
          .from(routines)
          .where(routineScope(and(eq(routines.id, target.routineId), routineActive)))
          .limit(1),
    link.target === "routine"
      ? []
      : db
          .select({ id: weeklyPlanEntries.id })
          .from(weeklyPlanEntries)
          .innerJoin(
            weeklyPlans,
            and(
              eq(weeklyPlans.physioId, weeklyPlanEntries.physioId),
              eq(weeklyPlans.id, weeklyPlanEntries.weeklyPlanId),
            ),
          )
          .innerJoin(
            routines,
            and(
              eq(routines.physioId, weeklyPlanEntries.physioId),
              eq(routines.id, weeklyPlanEntries.routineId),
            ),
          )
          .where(
            and(
              eq(weeklyPlanEntries.physioId, shell.physioId),
              eq(weeklyPlanEntries.routineId, target.routineId),
              target.entryId ? eq(weeklyPlanEntries.id, target.entryId) : undefined,
              planScope(scheduleFilter(weeklyPlans, "active", date)),
              // The same rule as the page: the plan's routine must be the customer's and finished.
              eq(routines.customerId, link.customerId),
              eq(routines.status, "active"),
            ),
          )
          .limit(1),
  ]);
  return standalone.length > 0 || inPlan.length > 0;
}

/**
 * The routine behind a workout link, or null when this link cannot reach it today (spec 12);
 * see `isReachable`.
 */
export async function getReachableRoutine(
  shell: ReachShell,
  link: ReachLink,
  routineId: string,
  now: Date = new Date(),
): Promise<PatientRoutine | null> {
  const today = todayIn(shell.timeZone, now);
  if (!(await isReachable(shell, link, { routineId }, today))) return null;
  const content = await loadRoutineContent(db, shell.physioId, link.customerId, [routineId]);
  return content.get(routineId) ?? null;
}
