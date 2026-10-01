import "server-only";

import { and, asc, eq, inArray, or, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  exerciseMedia,
  exercises,
  routineGroups,
  routineItemSets,
  routineItems,
  routines,
  weeklyPlanEntries,
  weeklyPlans,
} from "@/db/schema";
import { isoWeekday, todayIn } from "@/lib/calendar-date";
import type { ItemPrescription, SetPrescription } from "@/lib/prescription";
import { nextStart } from "@/lib/schedule";
import { parseYouTubeUrl } from "@/lib/youtube";
import { scheduleFilter } from "@/server/schedule/active";

import type { ActiveLink, LinkShell } from "./resolve-link";

/**
 * What the patient page shows, and nothing else (spec 10, "Exposed to patients"): names, notes,
 * exercise instructions and media, prescription. No case details, history, visit notes, other
 * customers, last names or contact details of the customer.
 */
export type PatientItem = ItemPrescription & {
  id: string;
  name: string;
  instructions: string | null;
  sets: SetPrescription[];
  media: { videoId: string; isShort: boolean }[];
};

export type PatientBlock =
  | { kind: "single"; item: PatientItem }
  | { kind: "group"; key: string; restSeconds: number | null; items: PatientItem[] };

export type PatientRoutine = {
  id: string;
  name: string;
  notes: string | null;
  sessionsPerWeek: number | null;
  sessionsPerDay: number | null;
  blocks: PatientBlock[];
};

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
 * answer "can this link see it?" the same way.
 */
function linkScopes(
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

  const content = await loadRoutines(shell.physioId, link.customerId, [
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

/**
 * The routine behind a workout link, or null when this link cannot reach it (spec 12): one of the
 * customer's active standalone routines, a routine in an active plan entry of the link's
 * customer, or the single routine or plan the link points at. The id comes from the request, so
 * it is only ever matched against what the link itself can reach.
 */
export async function getReachableRoutine(
  shell: Pick<LinkShell, "physioId" | "timeZone">,
  link: Pick<ActiveLink, "target" | "customerId" | "routineId" | "weeklyPlanId">,
  routineId: string,
  now: Date = new Date(),
): Promise<PatientRoutine | null> {
  const today = todayIn(shell.timeZone, now);
  const { planScope, routineScope, routineActive } = linkScopes(shell, link, today);

  const [standalone, inPlan] = await Promise.all([
    link.target === "weekly_plan"
      ? []
      : db
          .select({ id: routines.id })
          .from(routines)
          .where(routineScope(and(eq(routines.id, routineId), routineActive)))
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
              eq(weeklyPlanEntries.routineId, routineId),
              planScope(scheduleFilter(weeklyPlans, "active", today)),
              // The same rule as the page: the plan's routine must be the customer's and finished.
              eq(routines.customerId, link.customerId),
              eq(routines.status, "active"),
            ),
          )
          .limit(1),
  ]);
  if (standalone.length === 0 && inPlan.length === 0) return null;

  const content = await loadRoutines(shell.physioId, link.customerId, [routineId]);
  return content.get(routineId) ?? null;
}

/** Routines with their exercises, grouped into supersets, for the given (already scoped) ids. */
async function loadRoutines(
  physioId: string,
  customerId: string,
  ids: string[],
): Promise<Map<string, PatientRoutine>> {
  const result = new Map<string, PatientRoutine>();
  if (ids.length === 0) return result;

  const headers = await db
    .select({
      id: routines.id,
      name: routines.name,
      notes: routines.notes,
      sessionsPerWeek: routines.sessionsPerWeek,
      sessionsPerDay: routines.sessionsPerDay,
    })
    .from(routines)
    .where(
      and(
        eq(routines.physioId, physioId),
        eq(routines.customerId, customerId),
        inArray(routines.id, ids),
      ),
    );
  if (headers.length === 0) return result;
  const routineIds = headers.map((header) => header.id);

  const [groupRows, itemRows] = await Promise.all([
    db
      .select({ id: routineGroups.id, restSeconds: routineGroups.restSeconds })
      .from(routineGroups)
      .where(
        and(eq(routineGroups.physioId, physioId), inArray(routineGroups.routineId, routineIds)),
      ),
    db
      .select({
        id: routineItems.id,
        routineId: routineItems.routineId,
        exerciseId: routineItems.exerciseId,
        groupId: routineItems.groupId,
        name: exercises.name,
        instructions: exercises.instructions,
        holdSeconds: routineItems.holdSeconds,
        restSeconds: routineItems.restSeconds,
        side: routineItems.side,
        notes: routineItems.notes,
      })
      .from(routineItems)
      .innerJoin(
        exercises,
        and(
          eq(exercises.physioId, routineItems.physioId),
          eq(exercises.id, routineItems.exerciseId),
        ),
      )
      .where(and(eq(routineItems.physioId, physioId), inArray(routineItems.routineId, routineIds)))
      .orderBy(asc(routineItems.routineId), asc(routineItems.position)),
  ]);

  const itemIds = itemRows.map((item) => item.id);
  const exerciseIds = [...new Set(itemRows.map((item) => item.exerciseId))];
  const [setRows, mediaRows] = itemRows.length
    ? await Promise.all([
        db
          .select({
            itemId: routineItemSets.routineItemId,
            reps: routineItemSets.reps,
            repsMax: routineItemSets.repsMax,
            durationSeconds: routineItemSets.durationSeconds,
            load: routineItemSets.load,
          })
          .from(routineItemSets)
          .where(
            and(
              eq(routineItemSets.physioId, physioId),
              inArray(routineItemSets.routineItemId, itemIds),
            ),
          )
          .orderBy(asc(routineItemSets.routineItemId), asc(routineItemSets.position)),
        db
          .select({
            exerciseId: exerciseMedia.exerciseId,
            kind: exerciseMedia.kind,
            url: exerciseMedia.externalUrl,
          })
          .from(exerciseMedia)
          .where(
            and(
              eq(exerciseMedia.physioId, physioId),
              inArray(exerciseMedia.exerciseId, exerciseIds),
            ),
          )
          .orderBy(asc(exerciseMedia.exerciseId), asc(exerciseMedia.position)),
      ])
    : [[], []];

  const setsByItem = new Map<string, SetPrescription[]>();
  for (const { itemId, ...set } of setRows) {
    setsByItem.set(itemId, [...(setsByItem.get(itemId) ?? []), set]);
  }
  const mediaByExercise = new Map<string, PatientItem["media"]>();
  for (const row of mediaRows) {
    const video = row.kind === "youtube" ? parseYouTubeUrl(row.url) : null;
    if (!video) continue;
    mediaByExercise.set(row.exerciseId, [
      ...(mediaByExercise.get(row.exerciseId) ?? []),
      { videoId: video.videoId, isShort: video.isShort },
    ]);
  }
  const restOfGroup = new Map(groupRows.map((group) => [group.id, group.restSeconds]));

  for (const header of headers) {
    const blocks: PatientBlock[] = [];
    for (const row of itemRows.filter((item) => item.routineId === header.id)) {
      const item: PatientItem = {
        id: row.id,
        name: row.name,
        instructions: row.instructions,
        holdSeconds: row.holdSeconds,
        restSeconds: row.restSeconds,
        side: row.side,
        notes: row.notes,
        sets: setsByItem.get(row.id) ?? [],
        media: mediaByExercise.get(row.exerciseId) ?? [],
      };
      const last = blocks.at(-1);
      if (row.groupId === null) {
        blocks.push({ kind: "single", item });
      } else if (last?.kind === "group" && last.key === row.groupId) {
        last.items.push(item);
      } else {
        blocks.push({
          kind: "group",
          key: row.groupId,
          restSeconds: restOfGroup.get(row.groupId) ?? null,
          items: [item],
        });
      }
    }
    result.set(header.id, { ...header, blocks });
  }
  return result;
}
