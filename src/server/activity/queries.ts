import "server-only";

import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";

import type { Tx } from "@/db/rls";
import {
  customers,
  routines,
  sessionLogs,
  shareLinks,
  weeklyPlanEntries,
  weeklyPlans,
} from "@/db/schema";
import {
  adherence,
  dayCells,
  heatmapWeeks,
  painSeries,
  type Adherence,
  type DayCell,
  type LogFact,
  type PainPoint,
  type PlanFact,
  type SingleFact,
} from "@/lib/adherence";
import { customerName } from "@/lib/customers";
import { addDays } from "@/lib/phases";
import { buildDashboard, type Dashboard, type UnseenComment } from "@/lib/dashboard";
import { attentionWindows } from "@/lib/attention";

import { isUuid } from "@/server/customers/schemas";

export const ACTIVITY_WEEKS = 12;
/** The comments feed shows this many of the newest comments. */
export const COMMENTS_LIMIT = 50;
const UNSEEN_LIMIT = 200;

type ScheduleFacts = { plans: PlanFact[]; singles: SingleFact[] };

/**
 * What was planned for customers, as facts for `src/lib/adherence.ts`: their active plans (with
 * the entries whose routine is finished and theirs, as on the patient page) and standalone
 * routines. `customerId` narrows it to one customer.
 */
async function loadScheduleFacts(
  tx: Tx,
  physioId: string,
  customerId?: string,
): Promise<Map<string, ScheduleFacts>> {
  const facts = new Map<string, ScheduleFacts>();
  const of = (id: string) => {
    let entry = facts.get(id);
    if (!entry) facts.set(id, (entry = { plans: [], singles: [] }));
    return entry;
  };

  const [planRows, routineRows] = await Promise.all([
    tx
      .select({
        id: weeklyPlans.id,
        customerId: weeklyPlans.customerId,
        status: weeklyPlans.status,
        startsOn: weeklyPlans.startsOn,
        endsOn: weeklyPlans.endsOn,
      })
      .from(weeklyPlans)
      .where(
        and(
          eq(weeklyPlans.physioId, physioId),
          isNotNull(weeklyPlans.customerId),
          eq(weeklyPlans.status, "active"),
          customerId ? eq(weeklyPlans.customerId, customerId) : undefined,
        ),
      ),
    tx
      .select({
        customerId: routines.customerId,
        status: routines.status,
        startsOn: routines.startsOn,
        endsOn: routines.endsOn,
        sessionsPerWeek: routines.sessionsPerWeek,
        sessionsPerDay: routines.sessionsPerDay,
      })
      .from(routines)
      .where(
        and(
          eq(routines.physioId, physioId),
          isNotNull(routines.customerId),
          eq(routines.isStandalone, true),
          eq(routines.status, "active"),
          customerId ? eq(routines.customerId, customerId) : undefined,
        ),
      ),
  ]);
  const entryRows =
    planRows.length === 0
      ? []
      : await tx
          .select({
            id: weeklyPlanEntries.id,
            planId: weeklyPlanEntries.weeklyPlanId,
            weekday: weeklyPlanEntries.weekday,
            routineId: weeklyPlanEntries.routineId,
            routineCustomerId: routines.customerId,
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
              eq(weeklyPlanEntries.physioId, physioId),
              inArray(
                weeklyPlanEntries.weeklyPlanId,
                planRows.map((plan) => plan.id),
              ),
              eq(routines.status, "active"),
            ),
          );

  for (const plan of planRows) {
    of(plan.customerId!).plans.push({
      status: plan.status,
      startsOn: plan.startsOn,
      endsOn: plan.endsOn,
      entries: entryRows
        // A plan only counts entries whose routine belongs to the plan's customer.
        .filter((entry) => entry.planId === plan.id && entry.routineCustomerId === plan.customerId)
        .map(({ id, weekday, routineId }) => ({ id, weekday, routineId })),
    });
  }
  for (const routine of routineRows) {
    of(routine.customerId!).singles.push({
      status: routine.status,
      startsOn: routine.startsOn,
      endsOn: routine.endsOn,
      sessionsPerWeek: routine.sessionsPerWeek,
      sessionsPerDay: routine.sessionsPerDay,
    });
  }
  return facts;
}

export type ActivityComment = {
  id: string;
  routineName: string;
  performedOn: string;
  comment: string;
  pain: number | null;
  /** Has the physio opened the Activity tab since this comment arrived? */
  seen: boolean;
};

export type CustomerActivity = {
  /** Monday-first columns of dates, the last one holding today. */
  weeks: string[][];
  /** One cell per date of `weeks`, in the same order. */
  cells: DayCell[];
  pain: {
    overall: PainPoint[];
    routines: { id: string; name: string; points: PainPoint[] }[];
  };
  comments: ActivityComment[];
  unseenCount: number;
  summary: {
    completed: number;
    lastLoggedOn: string | null;
    /** The 4 weeks that ended yesterday: a session not done yet today is not held against them. */
    adherence: Adherence;
  };
};

/** The Activity tab (spec 13) for one customer: the last 12 weeks of logs against the plan. */
export async function getCustomerActivity(
  tx: Tx,
  physioId: string,
  customerId: string,
  today: string,
): Promise<CustomerActivity> {
  const weeks = heatmapWeeks(today, ACTIVITY_WEEKS);
  const from = weeks[0]![0]!;
  const to = weeks.at(-1)!.at(-1)!;
  const empty: CustomerActivity = {
    weeks,
    cells: [],
    pain: { overall: [], routines: [] },
    comments: [],
    unseenCount: 0,
    summary: {
      completed: 0,
      lastLoggedOn: null,
      adherence: { planned: 0, completed: 0, ratio: null },
    },
  };
  if (!isUuid(customerId)) return empty;

  const [rows, facts] = await Promise.all([
    tx
      .select({
        id: sessionLogs.id,
        routineId: sessionLogs.routineId,
        routineName: routines.name,
        entryId: sessionLogs.weeklyPlanEntryId,
        performedOn: sessionLogs.performedOn,
        completed: sessionLogs.completed,
        pain: sessionLogs.pain,
        comment: sessionLogs.comment,
        seenAt: sessionLogs.seenByPhysioAt,
        updatedAt: sessionLogs.updatedAt,
      })
      .from(sessionLogs)
      .innerJoin(
        routines,
        and(eq(routines.physioId, sessionLogs.physioId), eq(routines.id, sessionLogs.routineId)),
      )
      .where(
        and(
          eq(sessionLogs.physioId, physioId),
          eq(sessionLogs.customerId, customerId),
          gte(sessionLogs.performedOn, from),
          lte(sessionLogs.performedOn, to),
        ),
      )
      .orderBy(desc(sessionLogs.performedOn), desc(sessionLogs.updatedAt)),
    loadScheduleFacts(tx, physioId, customerId),
  ]);
  if (rows.length === 0 && !facts.has(customerId)) return empty;

  const logs: LogFact[] = rows;
  const plans = facts.get(customerId)?.plans ?? [];
  const names = new Map(rows.map((row) => [row.routineId, row.routineName]));
  const commented = rows.filter((row) => row.comment !== null);

  return {
    weeks,
    cells: dayCells(from, to, today, plans, logs),
    pain: {
      overall: painSeries(logs, null),
      routines: [...names.entries()]
        .map(([id, name]) => ({ id, name, points: painSeries(logs, id) }))
        .filter((routine) => routine.points.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name)),
    },
    comments: commented.slice(0, COMMENTS_LIMIT).map((row) => ({
      id: row.id,
      routineName: row.routineName,
      performedOn: row.performedOn,
      comment: row.comment!,
      pain: row.pain,
      seen: row.seenAt !== null,
    })),
    unseenCount: commented.filter((row) => row.seenAt === null).length,
    summary: {
      completed: rows.filter((row) => row.completed).length,
      lastLoggedOn: rows[0]?.performedOn ?? null,
      adherence: adherence(
        addDays(today, -28),
        addDays(today, -1),
        plans,
        facts.get(customerId)?.singles ?? [],
        logs,
      ),
    },
  };
}

/** The dashboard (spec 13): who needs attention, new comments, recent activity and totals. */
export async function getDashboard(
  tx: Tx,
  physioId: string,
  today: string,
  now: Date = new Date(),
): Promise<Dashboard> {
  const since = attentionWindows(today).previous[0];
  const [customerRows, logRows, unseenRows, linkRows, facts] = await Promise.all([
    tx
      .select({ id: customers.id, firstName: customers.firstName, lastName: customers.lastName })
      .from(customers)
      .where(and(eq(customers.physioId, physioId), isNull(customers.archivedAt)))
      .orderBy(asc(customers.firstName), asc(customers.id)),
    tx
      .select({
        customerId: sessionLogs.customerId,
        routineId: sessionLogs.routineId,
        entryId: sessionLogs.weeklyPlanEntryId,
        performedOn: sessionLogs.performedOn,
        completed: sessionLogs.completed,
        pain: sessionLogs.pain,
        updatedAt: sessionLogs.updatedAt,
      })
      .from(sessionLogs)
      .where(and(eq(sessionLogs.physioId, physioId), gte(sessionLogs.performedOn, since))),
    tx
      .select({
        customerId: sessionLogs.customerId,
        comment: sessionLogs.comment,
        performedOn: sessionLogs.performedOn,
        routineName: routines.name,
      })
      .from(sessionLogs)
      .innerJoin(
        routines,
        and(eq(routines.physioId, sessionLogs.physioId), eq(routines.id, sessionLogs.routineId)),
      )
      .where(
        and(
          eq(sessionLogs.physioId, physioId),
          isNotNull(sessionLogs.comment),
          isNull(sessionLogs.seenByPhysioAt),
        ),
      )
      .orderBy(desc(sessionLogs.performedOn))
      .limit(UNSEEN_LIMIT),
    tx
      .selectDistinct({ customerId: shareLinks.customerId })
      .from(shareLinks)
      .where(
        and(
          eq(shareLinks.physioId, physioId),
          isNull(shareLinks.revokedAt),
          or(isNull(shareLinks.expiresAt), gt(shareLinks.expiresAt, now)),
        ),
      ),
    loadScheduleFacts(tx, physioId),
  ]);

  const linked = new Set(linkRows.map((row) => row.customerId));
  return buildDashboard({
    today,
    customers: customerRows.map((customer) => ({
      id: customer.id,
      name: customerName(customer.firstName, customer.lastName),
      plans: facts.get(customer.id)?.plans ?? [],
      singles: facts.get(customer.id)?.singles ?? [],
      logs: logRows.filter((row) => row.customerId === customer.id),
      hasLink: linked.has(customer.id),
    })),
    unseen: unseenRows.map((row): UnseenComment => ({
      customerId: row.customerId,
      comment: row.comment!,
      performedOn: row.performedOn,
      routineName: row.routineName,
    })),
  });
}
