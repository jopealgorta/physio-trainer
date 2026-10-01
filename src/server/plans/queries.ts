import "server-only";

import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";

import type { Tx } from "@/db/rls";
import { cases, customers, routines, weeklyPlanEntries, weeklyPlans } from "@/db/schema";
import type { PlanFilters } from "@/lib/plan-params";
import { PLANS_LIST_LIMIT, WEEKDAYS } from "@/lib/plans";
import type { RoutineStatus } from "@/lib/routines";
import { escapeLike } from "@/lib/sql-like";

import { isUuid } from "./schemas";

export type PlanSummary = {
  id: string;
  name: string;
  status: RoutineStatus;
  customerId: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  caseTitle: string | null;
  /** Routines scheduled on each weekday, index 0 = Monday. */
  sessionsPerDay: number[];
  updatedAt: Date;
};

export async function listPlans(
  tx: Tx,
  physioId: string,
  filters: PlanFilters,
  limit = PLANS_LIST_LIMIT,
): Promise<{ plans: PlanSummary[]; truncated: boolean }> {
  const conditions: SQL[] = [eq(weeklyPlans.physioId, physioId)];
  if (filters.status !== "all") conditions.push(eq(weeklyPlans.status, filters.status));
  if (filters.customerId) {
    // A malformed id can never match (and must not reach a uuid comparison).
    if (!isUuid(filters.customerId)) return { plans: [], truncated: false };
    conditions.push(eq(weeklyPlans.customerId, filters.customerId));
  }
  if (filters.q) {
    conditions.push(
      sql`public.f_unaccent(lower(${weeklyPlans.name})) like public.f_unaccent(lower(${`%${escapeLike(filters.q)}%`}))`,
    );
  }

  const rows = await tx
    .select({
      id: weeklyPlans.id,
      name: weeklyPlans.name,
      status: weeklyPlans.status,
      customerId: weeklyPlans.customerId,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      caseTitle: cases.title,
      updatedAt: weeklyPlans.updatedAt,
    })
    .from(weeklyPlans)
    .leftJoin(
      customers,
      and(eq(customers.physioId, weeklyPlans.physioId), eq(customers.id, weeklyPlans.customerId)),
    )
    .leftJoin(
      cases,
      and(eq(cases.physioId, weeklyPlans.physioId), eq(cases.id, weeklyPlans.caseId)),
    )
    .where(and(...conditions))
    .orderBy(desc(weeklyPlans.updatedAt), asc(weeklyPlans.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);

  const perDay = new Map<string, number[]>();
  if (page.length > 0) {
    const counts = await tx
      .select({
        planId: weeklyPlanEntries.weeklyPlanId,
        weekday: weeklyPlanEntries.weekday,
        count: sql<number>`count(*)::int`,
      })
      .from(weeklyPlanEntries)
      .where(
        and(
          eq(weeklyPlanEntries.physioId, physioId),
          inArray(
            weeklyPlanEntries.weeklyPlanId,
            page.map((row) => row.id),
          ),
        ),
      )
      .groupBy(weeklyPlanEntries.weeklyPlanId, weeklyPlanEntries.weekday);
    for (const { planId, weekday, count } of counts) {
      const days = perDay.get(planId) ?? WEEKDAYS.map(() => 0);
      days[weekday - 1] = count;
      perDay.set(planId, days);
    }
  }

  return {
    plans: page.map((row) => ({
      ...row,
      sessionsPerDay: perDay.get(row.id) ?? WEEKDAYS.map(() => 0),
    })),
    truncated: rows.length > limit,
  };
}

export type PlanEntryDetail = {
  id: string;
  weekday: number;
  position: number;
  label: string | null;
  routineId: string;
  routineName: string;
  routineStatus: RoutineStatus;
  routineIsStandalone: boolean;
  exerciseCount: number;
  /** Entries in any plan that use this routine (1 = only this entry). */
  routineEntryCount: number;
};

export type PlanDetail = {
  id: string;
  version: number;
  customerId: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  name: string;
  notes: string | null;
  caseId: string | null;
  status: RoutineStatus;
  entries: PlanEntryDetail[];
  cases: { id: string; title: string; status: "open" | "closed" }[];
};

export async function getPlan(tx: Tx, physioId: string, id: string): Promise<PlanDetail | null> {
  if (!isUuid(id)) return null;
  const [header] = await tx
    .select({
      id: weeklyPlans.id,
      version: weeklyPlans.version,
      customerId: weeklyPlans.customerId,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      name: weeklyPlans.name,
      notes: weeklyPlans.notes,
      caseId: weeklyPlans.caseId,
      status: weeklyPlans.status,
    })
    .from(weeklyPlans)
    .leftJoin(
      customers,
      and(eq(customers.physioId, weeklyPlans.physioId), eq(customers.id, weeklyPlans.customerId)),
    )
    .where(and(eq(weeklyPlans.physioId, physioId), eq(weeklyPlans.id, id)));
  if (!header) return null;

  const [entries, customerCases] = await Promise.all([
    tx
      .select({
        id: weeklyPlanEntries.id,
        weekday: weeklyPlanEntries.weekday,
        position: weeklyPlanEntries.position,
        label: weeklyPlanEntries.label,
        routineId: weeklyPlanEntries.routineId,
        routineName: routines.name,
        routineStatus: routines.status,
        routineIsStandalone: routines.isStandalone,
        // Written out with table aliases: Drizzle renders columns unqualified in a subquery.
        exerciseCount: sql<number>`(
          select count(*)::int from routine_items i
          where i.physio_id = routines.physio_id and i.routine_id = routines.id)`,
        routineEntryCount: sql<number>`(
          select count(*)::int from weekly_plan_entries e
          where e.physio_id = routines.physio_id and e.routine_id = routines.id)`,
      })
      .from(weeklyPlanEntries)
      .innerJoin(
        routines,
        and(
          eq(routines.physioId, weeklyPlanEntries.physioId),
          eq(routines.id, weeklyPlanEntries.routineId),
        ),
      )
      .where(and(eq(weeklyPlanEntries.physioId, physioId), eq(weeklyPlanEntries.weeklyPlanId, id)))
      .orderBy(
        asc(weeklyPlanEntries.weekday),
        asc(weeklyPlanEntries.position),
        asc(weeklyPlanEntries.id),
      ),
    header.customerId
      ? tx
          .select({ id: cases.id, title: cases.title, status: cases.status })
          .from(cases)
          .where(and(eq(cases.physioId, physioId), eq(cases.customerId, header.customerId)))
          .orderBy(asc(cases.createdAt), asc(cases.id))
      : Promise.resolve([]),
  ]);

  return { ...header, entries, cases: customerCases };
}

export type AttachableRoutine = {
  id: string;
  name: string;
  status: RoutineStatus;
  isStandalone: boolean;
  itemCount: number;
};

/** A customer's routines that can be attached to a plan (not archived), newest first. */
export async function listAttachableRoutines(
  tx: Tx,
  physioId: string,
  customerId: string,
): Promise<AttachableRoutine[]> {
  if (!isUuid(customerId)) return [];
  return tx
    .select({
      id: routines.id,
      name: routines.name,
      status: routines.status,
      isStandalone: routines.isStandalone,
      itemCount: sql<number>`(
        select count(*)::int from routine_items i
        where i.physio_id = routines.physio_id and i.routine_id = routines.id)`,
    })
    .from(routines)
    .where(
      and(
        eq(routines.physioId, physioId),
        eq(routines.customerId, customerId),
        sql`${routines.status} <> 'archived'`,
      ),
    )
    .orderBy(asc(routines.name), asc(routines.id));
}
