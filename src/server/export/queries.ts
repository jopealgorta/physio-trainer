import "server-only";

import { and, asc, eq, inArray, ne, type SQL } from "drizzle-orm";

import type { Tx } from "@/db/rls";
import { customers, routines, weeklyPlanEntries, weeklyPlans } from "@/db/schema";
import { env } from "@/env";
import { isUuid } from "@/lib/patient-paths";
import { buildShareUrl } from "@/lib/share-links";
import { loadRoutineContent } from "@/server/routines/content";
import { scheduleFilter } from "@/server/schedule/active";
import { ensureShareLink } from "@/server/sharing/mutations";
import { linkStatus } from "@/server/sharing/view";

import type { ExportPhase, ExportSourceData, SourcePlan, SourceRoutine } from "./model";

/**
 * What the physio exports (spec 14), read under their session: RLS applies and every query also
 * filters `physio_id`. Templates (no customer) are never exported.
 */

type PhaseColumns = { phaseLabel: string | null; startsOn: string | null; endsOn: string | null };

const phaseOf = ({ phaseLabel, startsOn, endsOn }: PhaseColumns): ExportPhase | null =>
  phaseLabel === null && startsOn === null && endsOn === null
    ? null
    : { label: phaseLabel, startsOn, endsOn };

const customerColumns = {
  id: customers.id,
  firstName: customers.firstName,
  locale: customers.locale,
};

const customerJoin = (table: typeof routines | typeof weeklyPlans) =>
  and(eq(customers.physioId, table.physioId), eq(customers.id, table.customerId));

/** Entries of the plans, ordered by plan, weekday and position, whose routine passes `routineWhere`. */
async function planEntries(
  tx: Tx,
  physioId: string,
  customerId: string,
  planIds: string[],
  routineWhere: SQL,
) {
  if (planIds.length === 0) return [];
  return tx
    .select({
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
        eq(weeklyPlanEntries.physioId, physioId),
        inArray(weeklyPlanEntries.weeklyPlanId, planIds),
        // Only the plan's own customer's routines, whatever the entry says.
        eq(routines.customerId, customerId),
        routineWhere,
      ),
    )
    .orderBy(asc(weeklyPlanEntries.weekday), asc(weeklyPlanEntries.position));
}

type PlanRow = PhaseColumns & { id: string; name: string; notes: string | null };
type EntryRow = Awaited<ReturnType<typeof planEntries>>[number];

/**
 * Loads the content of `routineRows` (standalone, keeping their phase) and of the routines the
 * plan entries use (phase-less, each once, in first-appearance order), and builds the plans.
 */
async function assemble(
  tx: Tx,
  physioId: string,
  customerId: string,
  planRows: PlanRow[],
  entryRows: EntryRow[],
  routineRows: (PhaseColumns & { id: string })[],
): Promise<Pick<ExportSourceData, "plans" | "routines" | "planRoutines">> {
  const routineIds = routineRows.map((row) => row.id);
  const planRoutineIds = [...new Set(entryRows.map((entry) => entry.routineId))].filter(
    (id) => !routineIds.includes(id),
  );
  const content = await loadRoutineContent(tx, physioId, customerId, [
    ...routineIds,
    ...planRoutineIds,
  ]);

  const plans = planRows.map(({ phaseLabel, startsOn, endsOn, ...plan }): SourcePlan => ({
    ...plan,
    phase: phaseOf({ phaseLabel, startsOn, endsOn }),
    entries: entryRows
      .filter((entry) => entry.planId === plan.id && content.has(entry.routineId))
      .map(({ weekday, label, routineId }) => ({ weekday, label, routineId })),
  }));
  const withPhase = (id: string, phase: ExportPhase | null): SourceRoutine[] => {
    const routine = content.get(id);
    return routine ? [{ ...routine, phase }] : [];
  };
  return {
    plans,
    routines: routineRows.flatMap((row) => withPhase(row.id, phaseOf(row))),
    planRoutines: planRoutineIds.flatMap((id) => withPhase(id, null)),
  };
}

const phaseColumns = (table: typeof routines | typeof weeklyPlans) => ({
  phaseLabel: table.phaseLabel,
  startsOn: table.startsOn,
  endsOn: table.endsOn,
});

/** One routine, whatever its status. */
export async function getRoutineExport(
  tx: Tx,
  physioId: string,
  routineId: string,
): Promise<ExportSourceData | null> {
  if (!isUuid(routineId)) return null;
  const [row] = await tx
    .select({ customer: customerColumns, routine: phaseColumns(routines), name: routines.name })
    .from(routines)
    .innerJoin(customers, customerJoin(routines))
    .where(and(eq(routines.physioId, physioId), eq(routines.id, routineId)));
  if (!row) return null;

  const data = await assemble(
    tx,
    physioId,
    row.customer.id,
    [],
    [],
    [{ id: routineId, ...row.routine }],
  );
  return { customer: row.customer, title: row.name, ...data };
}

/** One plan, whatever its status, with every entry whose routine is not archived. */
export async function getPlanExport(
  tx: Tx,
  physioId: string,
  planId: string,
): Promise<ExportSourceData | null> {
  if (!isUuid(planId)) return null;
  const [row] = await tx
    .select({
      customer: customerColumns,
      plan: {
        id: weeklyPlans.id,
        name: weeklyPlans.name,
        notes: weeklyPlans.notes,
        ...phaseColumns(weeklyPlans),
      },
    })
    .from(weeklyPlans)
    .innerJoin(customers, customerJoin(weeklyPlans))
    .where(and(eq(weeklyPlans.physioId, physioId), eq(weeklyPlans.id, planId)));
  if (!row) return null;

  // The physio sees their drafts too; archived routines are gone from the plan's board.
  const entryRows = await planEntries(
    tx,
    physioId,
    row.customer.id,
    [planId],
    ne(routines.status, "archived"),
  );
  const data = await assemble(tx, physioId, row.customer.id, [row.plan], entryRows, []);
  return { customer: row.customer, title: row.plan.name, ...data };
}

/** Everything active for the customer on `today`: what their customer share link shows. */
export async function getCustomerExport(
  tx: Tx,
  physioId: string,
  customerId: string,
  today: string,
): Promise<ExportSourceData | null> {
  if (!isUuid(customerId)) return null;
  const [customer] = await tx
    .select(customerColumns)
    .from(customers)
    .where(and(eq(customers.physioId, physioId), eq(customers.id, customerId)));
  if (!customer) return null;

  const [routineRows, planRows] = await Promise.all([
    tx
      .select({ id: routines.id, ...phaseColumns(routines) })
      .from(routines)
      .where(
        and(
          eq(routines.physioId, physioId),
          eq(routines.customerId, customerId),
          eq(routines.isStandalone, true),
          scheduleFilter(routines, "active", today),
        ),
      )
      .orderBy(asc(routines.name), asc(routines.id)),
    tx
      .select({
        id: weeklyPlans.id,
        name: weeklyPlans.name,
        notes: weeklyPlans.notes,
        ...phaseColumns(weeklyPlans),
      })
      .from(weeklyPlans)
      .where(
        and(
          eq(weeklyPlans.physioId, physioId),
          eq(weeklyPlans.customerId, customerId),
          scheduleFilter(weeklyPlans, "active", today),
        ),
      )
      .orderBy(asc(weeklyPlans.name), asc(weeklyPlans.id)),
  ]);
  const entryRows = await planEntries(
    tx,
    physioId,
    customerId,
    planRows.map((plan) => plan.id),
    eq(routines.status, "active"),
  );

  const data = await assemble(tx, physioId, customerId, planRows, entryRows, routineRows);
  return { customer, title: null, ...data };
}

/** The customer's live link URL for the QR; creates the link when none ever existed. */
export async function exportShareUrl(
  tx: Tx,
  physioId: string,
  customerId: string,
  now: Date = new Date(),
): Promise<string | null> {
  const result = await ensureShareLink(tx, physioId, { target: "customer", customerId });
  if (!result.ok) return null;
  const { link, context } = result.data;
  if (linkStatus(link, now) !== "active") return null;
  return buildShareUrl(env.NEXT_PUBLIC_APP_URL, context.handle, link.slug, link.code);
}
