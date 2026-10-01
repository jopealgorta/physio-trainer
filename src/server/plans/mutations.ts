import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { isForeignKeyViolation } from "@/db/errors";
import type { Tx } from "@/db/rls";
import { cases, customers, routines, weeklyPlanEntries, weeklyPlans } from "@/db/schema";
import {
  appendEntry,
  changedEntries,
  copyEntry as copyEntryTo,
  moveEntry as moveEntryTo,
  normalizeEntries,
  type PlacedEntry,
} from "@/lib/plans";
import type { RoutineStatus } from "@/lib/routines";
import { distinctRoutineIds, remapEntries } from "@/lib/templates";
import { copyRoutine, createRoutine, duplicateRoutine } from "@/server/routines/mutations";

import {
  isUuid,
  type AddEntryInput,
  type AddNewRoutineEntryInput,
  type CopyEntryInput,
  type CreatePlanInput,
  type MoveEntryInput,
  type PlanError,
  type RemoveEntryInput,
  type Result,
  type SeparateCopyInput,
  type SetLabelInput,
  type UpdatePlanInput,
} from "./schemas";

const ok = <T>(data: T) => ({ ok: true, data }) as const;
const fail = <E extends string>(error: E) => ({ ok: false, error }) as const;

type Entry = PlacedEntry & { routineId: string; label: string | null };

/** Whether the customer has this case. Plans without a customer have none. */
async function caseBelongs(tx: Tx, physioId: string, customerId: string, caseId: string) {
  const [row] = await tx
    .select({ id: cases.id })
    .from(cases)
    .where(
      and(eq(cases.physioId, physioId), eq(cases.id, caseId), eq(cases.customerId, customerId)),
    );
  return row !== undefined;
}

export async function createPlan(
  tx: Tx,
  physioId: string,
  input: CreatePlanInput,
): Promise<Result<{ id: string }, "customerNotFound" | "caseNotFound">> {
  if (!isUuid(input.customerId)) return fail("customerNotFound");
  const [customer] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.physioId, physioId), eq(customers.id, input.customerId)));
  if (!customer) return fail("customerNotFound");
  if (input.caseId !== null && !(await caseBelongs(tx, physioId, input.customerId, input.caseId))) {
    return fail("caseNotFound");
  }

  const [row] = await tx
    .insert(weeklyPlans)
    .values({
      physioId,
      customerId: input.customerId,
      caseId: input.caseId,
      name: input.name,
    })
    .returning({ id: weeklyPlans.id });
  return ok(row);
}

/**
 * Locks the plan row so board actions on one plan serialise (positions are rewritten from a
 * snapshot of the entries), and returns what the actions need. Null when the plan is not the
 * physio's.
 */
async function lockPlan(tx: Tx, physioId: string, planId: string) {
  if (!isUuid(planId)) return null;
  const [plan] = await tx
    .select({
      id: weeklyPlans.id,
      customerId: weeklyPlans.customerId,
      caseId: weeklyPlans.caseId,
      status: weeklyPlans.status,
    })
    .from(weeklyPlans)
    .where(and(eq(weeklyPlans.physioId, physioId), eq(weeklyPlans.id, planId)))
    .for("update");
  return plan ?? null;
}

const loadEntries = (tx: Tx, physioId: string, planId: string): Promise<Entry[]> =>
  tx
    .select({
      id: weeklyPlanEntries.id,
      weekday: weeklyPlanEntries.weekday,
      position: weeklyPlanEntries.position,
      routineId: weeklyPlanEntries.routineId,
      label: weeklyPlanEntries.label,
    })
    .from(weeklyPlanEntries)
    .where(
      and(eq(weeklyPlanEntries.physioId, physioId), eq(weeklyPlanEntries.weeklyPlanId, planId)),
    );

/** Every board action bumps the plan's version (spec 15 snapshots build on it). */
const bump = (tx: Tx, physioId: string, planId: string) =>
  tx
    .update(weeklyPlans)
    .set({ version: sql`${weeklyPlans.version} + 1`, updatedAt: new Date() })
    .where(and(eq(weeklyPlans.physioId, physioId), eq(weeklyPlans.id, planId)));

/** Writes the weekday/position of every entry that differs between two arrangements. */
async function persistArrangement(
  tx: Tx,
  physioId: string,
  planId: string,
  before: Entry[],
  after: Entry[],
) {
  for (const entry of changedEntries(before, after)) {
    await tx
      .update(weeklyPlanEntries)
      .set({ weekday: entry.weekday, position: entry.position })
      .where(
        and(
          eq(weeklyPlanEntries.physioId, physioId),
          eq(weeklyPlanEntries.weeklyPlanId, planId),
          eq(weeklyPlanEntries.id, entry.id),
        ),
      );
  }
}

export async function updatePlan(
  tx: Tx,
  physioId: string,
  input: UpdatePlanInput,
): Promise<
  Result<{ version: number }, "notFound" | "caseNotFound" | "needsEntries" | "hasArchivedRoutines">
> {
  const plan = await lockPlan(tx, physioId, input.id);
  if (!plan) return fail("notFound");

  if (input.caseId !== null) {
    if (!plan.customerId || !(await caseBelongs(tx, physioId, plan.customerId, input.caseId))) {
      return fail("caseNotFound");
    }
  }
  if (input.status === "active" && plan.status !== "active") {
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(weeklyPlanEntries)
      .where(
        and(eq(weeklyPlanEntries.physioId, physioId), eq(weeklyPlanEntries.weeklyPlanId, plan.id)),
      );
    if (count === 0) return fail("needsEntries");
    // An active plan never schedules an archived routine (a draft plan can hold one, since only
    // active plans block archiving).
    const [{ archived }] = await tx
      .select({ archived: sql<number>`count(*)::int` })
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
          eq(weeklyPlanEntries.weeklyPlanId, plan.id),
          eq(routines.status, "archived"),
        ),
      );
    if (archived > 0) return fail("hasArchivedRoutines");
  }

  const [saved] = await tx
    .update(weeklyPlans)
    .set({
      name: input.name,
      notes: input.notes,
      caseId: input.caseId,
      status: input.status,
      version: sql`${weeklyPlans.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(weeklyPlans.physioId, physioId), eq(weeklyPlans.id, plan.id)))
    .returning({ version: weeklyPlans.version });
  return ok({ version: saved.version });
}

type BoardResult<T = Record<string, never>> = Result<T, PlanError>;

/** Attaches an existing routine of the plan's customer to a day. */
export async function addEntry(
  tx: Tx,
  physioId: string,
  input: AddEntryInput,
): Promise<BoardResult<{ entryId: string }>> {
  const plan = await lockPlan(tx, physioId, input.planId);
  if (!plan) return fail("notFound");
  if (!plan.customerId) return fail("needsCustomer");

  const [routine] = await tx
    .select({ id: routines.id, customerId: routines.customerId, status: routines.status })
    .from(routines)
    .where(and(eq(routines.physioId, physioId), eq(routines.id, input.routineId)));
  // The routine must be the same physio's *and* the same customer's.
  if (!routine || routine.customerId !== plan.customerId) return fail("routineNotFound");
  if (routine.status === "archived") return fail("routineArchived");

  const entries = await loadEntries(tx, physioId, plan.id);
  const entryId = crypto.randomUUID();
  const next = appendEntry(entries, {
    id: entryId,
    weekday: input.weekday,
    position: 0,
    routineId: routine.id,
    label: input.label,
  });
  if (!next) return fail("dayFull");
  const added = next.find((entry) => entry.id === entryId)!;

  await tx.insert(weeklyPlanEntries).values({
    id: entryId,
    physioId,
    weeklyPlanId: plan.id,
    weekday: added.weekday,
    routineId: routine.id,
    position: added.position,
    label: input.label,
  });
  if (input.standalone !== undefined) {
    await tx
      .update(routines)
      .set({ isStandalone: input.standalone })
      .where(and(eq(routines.physioId, physioId), eq(routines.id, routine.id)));
  }
  await bump(tx, physioId, plan.id);
  return ok({ entryId });
}

/** Creates a draft routine (not standalone) for the plan's customer and attaches it to a day. */
export async function addNewRoutineEntry(
  tx: Tx,
  physioId: string,
  input: AddNewRoutineEntryInput,
): Promise<BoardResult<{ entryId: string; routineId: string }>> {
  const plan = await lockPlan(tx, physioId, input.planId);
  if (!plan) return fail("notFound");
  if (!plan.customerId) return fail("needsCustomer");

  const entries = await loadEntries(tx, physioId, plan.id);
  const entryId = crypto.randomUUID();
  const next = appendEntry(entries, {
    id: entryId,
    weekday: input.weekday,
    position: 0,
    routineId: "",
    label: null,
  });
  if (!next) return fail("dayFull");
  const { position } = next.find((entry) => entry.id === entryId)!;

  const created = await createRoutine(tx, physioId, {
    customerId: plan.customerId,
    name: input.name,
    caseId: plan.caseId,
  });
  if (!created.ok) return fail(created.error);
  await tx
    .update(routines)
    .set({ isStandalone: false })
    .where(and(eq(routines.physioId, physioId), eq(routines.id, created.data.id)));
  await tx.insert(weeklyPlanEntries).values({
    id: entryId,
    physioId,
    weeklyPlanId: plan.id,
    weekday: input.weekday,
    routineId: created.data.id,
    position,
    label: null,
  });
  await bump(tx, physioId, plan.id);
  return ok({ entryId, routineId: created.data.id });
}

/** Moves an entry to a weekday at an index (reorder when the weekday is unchanged). */
export async function moveEntry(
  tx: Tx,
  physioId: string,
  input: MoveEntryInput,
): Promise<BoardResult> {
  const plan = await lockPlan(tx, physioId, input.planId);
  if (!plan) return fail("notFound");
  const entries = await loadEntries(tx, physioId, plan.id);
  if (!entries.some((entry) => entry.id === input.entryId)) return fail("entryNotFound");

  const next = moveEntryTo(entries, input.entryId, input.weekday, input.index);
  if (!next) return fail("dayFull");
  if (changedEntries(entries, next).length > 0) {
    await persistArrangement(tx, physioId, plan.id, entries, next);
    await bump(tx, physioId, plan.id);
  }
  return ok({});
}

/** Adds another entry for the same routine (by reference) at the end of a weekday. */
export async function copyEntry(
  tx: Tx,
  physioId: string,
  input: CopyEntryInput,
): Promise<BoardResult<{ entryId: string }>> {
  const plan = await lockPlan(tx, physioId, input.planId);
  if (!plan) return fail("notFound");
  const entries = await loadEntries(tx, physioId, plan.id);
  const source = entries.find((entry) => entry.id === input.entryId);
  if (!source) return fail("entryNotFound");

  const entryId = crypto.randomUUID();
  const next = copyEntryTo(entries, source.id, input.weekday, entryId);
  if (!next) return fail("dayFull");
  const added = next.find((entry) => entry.id === entryId)!;

  await tx.insert(weeklyPlanEntries).values({
    id: entryId,
    physioId,
    weeklyPlanId: plan.id,
    weekday: added.weekday,
    routineId: source.routineId,
    position: added.position,
    label: source.label,
  });
  await bump(tx, physioId, plan.id);
  return ok({ entryId });
}

export async function setEntryLabel(
  tx: Tx,
  physioId: string,
  input: SetLabelInput,
): Promise<BoardResult> {
  const plan = await lockPlan(tx, physioId, input.planId);
  if (!plan) return fail("notFound");
  const updated = await tx
    .update(weeklyPlanEntries)
    .set({ label: input.label })
    .where(
      and(
        eq(weeklyPlanEntries.physioId, physioId),
        eq(weeklyPlanEntries.weeklyPlanId, plan.id),
        eq(weeklyPlanEntries.id, input.entryId),
      ),
    )
    .returning({ id: weeklyPlanEntries.id });
  if (updated.length === 0) return fail("entryNotFound");
  await bump(tx, physioId, plan.id);
  return ok({});
}

/**
 * Removes an entry. With `deleteRoutine`, also deletes its routine when this was the last entry
 * (in any plan) that referenced it and it is not standalone (rule 3).
 */
export async function removeEntry(
  tx: Tx,
  physioId: string,
  input: RemoveEntryInput,
): Promise<BoardResult<{ deletedRoutine: boolean }>> {
  const plan = await lockPlan(tx, physioId, input.planId);
  if (!plan) return fail("notFound");
  const entries = await loadEntries(tx, physioId, plan.id);
  const entry = entries.find((candidate) => candidate.id === input.entryId);
  if (!entry) return fail("entryNotFound");

  await tx
    .delete(weeklyPlanEntries)
    .where(
      and(
        eq(weeklyPlanEntries.physioId, physioId),
        eq(weeklyPlanEntries.weeklyPlanId, plan.id),
        eq(weeklyPlanEntries.id, entry.id),
      ),
    );
  const remaining = entries.filter((candidate) => candidate.id !== entry.id);
  await persistArrangement(tx, physioId, plan.id, remaining, normalizeEntries(remaining));

  let deletedRoutine = false;
  if (input.deleteRoutine) {
    const [routine] = await tx
      .select({ isStandalone: routines.isStandalone })
      .from(routines)
      .where(and(eq(routines.physioId, physioId), eq(routines.id, entry.routineId)));
    const [{ uses }] = await tx
      .select({ uses: sql<number>`count(*)::int` })
      .from(weeklyPlanEntries)
      .where(
        and(
          eq(weeklyPlanEntries.physioId, physioId),
          eq(weeklyPlanEntries.routineId, entry.routineId),
        ),
      );
    if (routine && !routine.isStandalone && uses === 0) {
      try {
        // A savepoint: another plan may attach the routine between the count and the delete, and
        // the restrict FK then refuses; the entry is still removed, the routine stays.
        await tx.transaction((savepoint) =>
          savepoint
            .delete(routines)
            .where(and(eq(routines.physioId, physioId), eq(routines.id, entry.routineId))),
        );
        deletedRoutine = true;
      } catch (error) {
        if (!isForeignKeyViolation(error, "weekly_plan_entries_routine_fk")) throw error;
      }
    }
  }
  await bump(tx, physioId, plan.id);
  return ok({ deletedRoutine });
}

/**
 * "Make a separate copy": duplicates the entry's routine (items and all) and repoints only this
 * entry at the copy, so it can diverge from the other days.
 */
export async function makeSeparateCopy(
  tx: Tx,
  physioId: string,
  input: SeparateCopyInput,
  copyName: (sourceName: string) => string,
): Promise<BoardResult<{ routineId: string }>> {
  const plan = await lockPlan(tx, physioId, input.planId);
  if (!plan) return fail("notFound");
  const [entry] = await tx
    .select({ id: weeklyPlanEntries.id, routineId: weeklyPlanEntries.routineId })
    .from(weeklyPlanEntries)
    .where(
      and(
        eq(weeklyPlanEntries.physioId, physioId),
        eq(weeklyPlanEntries.weeklyPlanId, plan.id),
        eq(weeklyPlanEntries.id, input.entryId),
      ),
    );
  if (!entry) return fail("entryNotFound");

  const [source] = await tx
    .select({
      name: routines.name,
      status: routines.status,
      isStandalone: routines.isStandalone,
    })
    .from(routines)
    .where(and(eq(routines.physioId, physioId), eq(routines.id, entry.routineId)));
  if (!source) return fail("routineNotFound");

  // Something has to remain to diverge from: another entry, or the routine on its own. Otherwise
  // the original would be left with no use at all.
  const [{ others }] = await tx
    .select({ others: sql<number>`count(*)::int` })
    .from(weeklyPlanEntries)
    .where(
      and(
        eq(weeklyPlanEntries.physioId, physioId),
        eq(weeklyPlanEntries.routineId, entry.routineId),
        sql`${weeklyPlanEntries.id} <> ${entry.id}`,
      ),
    );
  if (others === 0 && !source.isStandalone) return fail("notShared");

  const copy = await duplicateRoutine(tx, physioId, entry.routineId, {
    name: copyName(source.name),
    isStandalone: false,
    // An archived routine cannot sit on a plan: the copy starts as a draft.
    status: source.status === "archived" ? "draft" : source.status,
  });
  if (!copy.ok) return fail("routineNotFound");
  await tx
    .update(weeklyPlanEntries)
    .set({ routineId: copy.data.id })
    .where(and(eq(weeklyPlanEntries.physioId, physioId), eq(weeklyPlanEntries.id, entry.id)));
  await bump(tx, physioId, plan.id);
  return ok({ routineId: copy.data.id });
}

export type PlanCopyTarget = {
  name: string;
  customerId: string | null;
  caseId: string | null;
  status: RoutineStatus;
  isTemplate: boolean;
  /** Status given to every copied routine. */
  routineStatus: RoutineStatus;
  /** Record provenance: plan.source_template_id = source plan, each routine copy's = its source routine. */
  linkSource: boolean;
};

/**
 * Deep-copies a plan (notes, entries with weekday/position/label) and each DISTINCT routine it
 * references exactly once, so routines shared across days stay shared inside the copy. Copied
 * routines are never standalone. The plan is locked `for share` (board actions lock `for update`),
 * and each routine is locked the same way by `copyRoutine`, so the copy sees a consistent plan.
 */
export async function copyPlan(
  tx: Tx,
  physioId: string,
  sourceId: string,
  target: PlanCopyTarget,
): Promise<Result<{ id: string }, "notFound">> {
  if (!isUuid(sourceId)) return fail("notFound");
  const [source] = await tx
    .select()
    .from(weeklyPlans)
    .where(and(eq(weeklyPlans.physioId, physioId), eq(weeklyPlans.id, sourceId)))
    .for("share");
  if (!source) return fail("notFound");

  const entries = await loadEntries(tx, physioId, source.id);
  const routineIds = new Map<string, string>();
  for (const routineId of distinctRoutineIds(entries)) {
    const copy = await copyRoutine(tx, physioId, routineId, (routine) => ({
      name: routine.name,
      customerId: target.customerId,
      caseId: target.caseId,
      isStandalone: false,
      status: target.routineStatus,
      isTemplate: target.isTemplate,
      sourceTemplateId: target.linkSource ? routine.id : null,
    }));
    if (!copy.ok) return fail("notFound");
    routineIds.set(routineId, copy.data.id);
  }

  const [plan] = await tx
    .insert(weeklyPlans)
    .values({
      physioId,
      customerId: target.customerId,
      caseId: target.caseId,
      name: target.name,
      notes: source.notes,
      isTemplate: target.isTemplate,
      sourceTemplateId: target.linkSource ? source.id : null,
      status: target.status,
    })
    .returning({ id: weeklyPlans.id });

  const copied = remapEntries(entries, routineIds);
  if (copied.length > 0) {
    await tx.insert(weeklyPlanEntries).values(
      copied.map((entry) => ({
        id: crypto.randomUUID(),
        physioId,
        weeklyPlanId: plan.id,
        weekday: entry.weekday,
        routineId: entry.routineId,
        position: entry.position,
        label: entry.label,
      })),
    );
  }
  return ok({ id: plan.id });
}
