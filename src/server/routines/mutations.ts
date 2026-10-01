import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { isForeignKeyViolation } from "@/db/errors";
import type { Tx } from "@/db/rls";
import {
  cases,
  customers,
  exercises,
  routineGroups,
  routineItemSets,
  routineItems,
  routines,
} from "@/db/schema";

import type { RoutineStatus } from "@/lib/routines";

import { listPlansUsingRoutine } from "./hooks";
import {
  isUuid,
  type CreateRoutineError,
  type CreateRoutineInput,
  type Result,
  type SaveRoutineError,
  type SaveRoutineInput,
} from "./schemas";

type Routine = typeof routines.$inferSelect;

const ok = <T>(data: T) => ({ ok: true, data }) as const;
const fail = <E extends string>(error: E) => ({ ok: false, error }) as const;

export async function createRoutine(
  tx: Tx,
  physioId: string,
  input: CreateRoutineInput,
): Promise<Result<{ id: string }, CreateRoutineError>> {
  if (!isUuid(input.customerId)) return fail("customerNotFound");
  const [customer] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.physioId, physioId), eq(customers.id, input.customerId)));
  if (!customer) return fail("customerNotFound");

  if (input.caseId !== null) {
    if (!isUuid(input.caseId)) return fail("caseNotFound");
    const [kase] = await tx
      .select({ id: cases.id })
      .from(cases)
      .where(
        and(
          eq(cases.physioId, physioId),
          eq(cases.id, input.caseId),
          eq(cases.customerId, input.customerId),
        ),
      );
    if (!kase) return fail("caseNotFound");
  }

  try {
    // A savepoint, so a constraint violation does not abort the caller's transaction.
    const [row] = await tx.transaction((savepoint) =>
      savepoint
        .insert(routines)
        .values({
          physioId,
          customerId: input.customerId,
          caseId: input.caseId,
          name: input.name,
        })
        .returning({ id: routines.id }),
    );
    return ok(row);
  } catch (error) {
    if (isForeignKeyViolation(error, "routines_customer_fk")) return fail("customerNotFound");
    if (isForeignKeyViolation(error, "routines_case_fk")) return fail("caseNotFound");
    throw error;
  }
}

/**
 * Replaces a routine's header, groups, items and sets in the caller's transaction. The routine
 * row is locked first, so concurrent saves serialise and the loser sees the bumped version
 * (optimistic locking). Groups, items and sets get fresh ids on every save; client keys are
 * never stored.
 */
export async function saveRoutine(
  tx: Tx,
  physioId: string,
  input: SaveRoutineInput,
): Promise<Result<{ version: number }, SaveRoutineError>> {
  if (!isUuid(input.id)) return fail("notFound");

  const [routine] = await tx
    .select({
      customerId: routines.customerId,
      version: routines.version,
      status: routines.status,
    })
    .from(routines)
    .where(and(eq(routines.physioId, physioId), eq(routines.id, input.id)))
    .for("update");
  if (!routine) return fail("notFound");
  if (routine.version !== input.version) return fail("conflict");

  if (input.caseId !== null) {
    // Templates (no customer) never have a case.
    if (routine.customerId === null) return fail("caseNotFound");
    const [kase] = await tx
      .select({ id: cases.id })
      .from(cases)
      .where(
        and(
          eq(cases.physioId, physioId),
          eq(cases.id, input.caseId),
          eq(cases.customerId, routine.customerId),
        ),
      );
    if (!kase) return fail("caseNotFound");
  }

  const exerciseIds = [...new Set(input.items.map((item) => item.exerciseId))];
  if (exerciseIds.length > 0) {
    const [{ found }] = await tx
      .select({ found: sql<number>`count(*)::int` })
      .from(exercises)
      .where(and(eq(exercises.physioId, physioId), inArray(exercises.id, exerciseIds)));
    if (found !== exerciseIds.length) return fail("exerciseNotFound");
  }

  if (input.status === "active" && input.items.length === 0) return fail("needsItems");
  if (input.status === "archived" && routine.status !== "archived") {
    const plans = await listPlansUsingRoutine(tx, physioId, input.id);
    if (plans.length > 0) return { ok: false, error: "blockedByPlans", plans } as const;
  }

  // Items first: their group FK is NO ACTION. Sets cascade with their item.
  await tx
    .delete(routineItems)
    .where(and(eq(routineItems.physioId, physioId), eq(routineItems.routineId, input.id)));
  await tx
    .delete(routineGroups)
    .where(and(eq(routineGroups.physioId, physioId), eq(routineGroups.routineId, input.id)));

  const groupIds = new Map(input.groups.map((group) => [group.key, crypto.randomUUID()]));
  if (input.groups.length > 0) {
    await tx.insert(routineGroups).values(
      input.groups.map((group) => ({
        id: groupIds.get(group.key)!,
        physioId,
        routineId: input.id,
        restSeconds: group.restSeconds,
      })),
    );
  }

  if (input.items.length > 0) {
    const itemIds = input.items.map(() => crypto.randomUUID());
    await tx.insert(routineItems).values(
      input.items.map((item, position) => ({
        id: itemIds[position],
        physioId,
        routineId: input.id,
        exerciseId: item.exerciseId,
        position,
        groupId: item.groupKey === null ? null : (groupIds.get(item.groupKey) ?? null),
        holdSeconds: item.holdSeconds,
        restSeconds: item.restSeconds,
        side: item.side,
        notes: item.notes,
      })),
    );
    const setRows = input.items.flatMap((item, index) =>
      item.sets.map((set, position) => ({
        id: crypto.randomUUID(),
        physioId,
        routineItemId: itemIds[index],
        position,
        reps: set.reps,
        repsMax: set.repsMax,
        durationSeconds: set.durationSeconds,
        load: set.load,
      })),
    );
    if (setRows.length > 0) await tx.insert(routineItemSets).values(setRows);
  }

  const [saved] = await tx
    .update(routines)
    .set({
      name: input.name,
      notes: input.notes,
      caseId: input.caseId,
      sessionsPerWeek: input.sessionsPerWeek,
      sessionsPerDay: input.sessionsPerDay,
      status: input.status,
      version: sql`${routines.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(routines.physioId, physioId), eq(routines.id, input.id)))
    .returning({ version: routines.version });
  return ok({ version: saved.version });
}

export type RoutineCopyTarget = {
  name: string;
  customerId: string | null;
  caseId: string | null;
  isStandalone: boolean;
  status: RoutineStatus;
  isTemplate: boolean;
  sourceTemplateId: string | null;
};

/**
 * Copies a routine's header, groups, items and sets into a new routine described by `target`
 * (given the source row). The source is locked `for share`, so a concurrent `saveRoutine` (which
 * locks `for update` and then replaces items) can never leave the copy with half-replaced items.
 * Callers decide the copy's owner/provenance; the DB checks keep `is_template` and `customer_id`
 * consistent.
 */
export async function copyRoutine(
  tx: Tx,
  physioId: string,
  sourceId: string,
  target: (source: Routine) => RoutineCopyTarget,
): Promise<Result<{ id: string }, "notFound">> {
  if (!isUuid(sourceId)) return fail("notFound");
  const [source] = await tx
    .select()
    .from(routines)
    .where(and(eq(routines.physioId, physioId), eq(routines.id, sourceId)))
    .for("share");
  if (!source) return fail("notFound");
  const to = target(source);

  const [copy] = await tx
    .insert(routines)
    .values({
      physioId,
      customerId: to.customerId,
      caseId: to.caseId,
      name: to.name,
      notes: source.notes,
      isTemplate: to.isTemplate,
      sourceTemplateId: to.sourceTemplateId,
      isStandalone: to.isStandalone,
      sessionsPerWeek: source.sessionsPerWeek,
      sessionsPerDay: source.sessionsPerDay,
      status: to.status,
    })
    .returning({ id: routines.id });

  const groups = await tx
    .select()
    .from(routineGroups)
    .where(and(eq(routineGroups.physioId, physioId), eq(routineGroups.routineId, sourceId)));
  const groupIds = new Map(groups.map((group) => [group.id, crypto.randomUUID()]));
  if (groups.length > 0) {
    await tx.insert(routineGroups).values(
      groups.map((group) => ({
        id: groupIds.get(group.id)!,
        physioId,
        routineId: copy.id,
        restSeconds: group.restSeconds,
      })),
    );
  }

  const items = await tx
    .select()
    .from(routineItems)
    .where(and(eq(routineItems.physioId, physioId), eq(routineItems.routineId, sourceId)));
  const itemIds = new Map(items.map((row) => [row.id, crypto.randomUUID()]));
  if (items.length > 0) {
    await tx.insert(routineItems).values(
      items.map((row) => ({
        id: itemIds.get(row.id)!,
        physioId,
        routineId: copy.id,
        exerciseId: row.exerciseId,
        position: row.position,
        groupId: row.groupId === null ? null : (groupIds.get(row.groupId) ?? null),
        holdSeconds: row.holdSeconds,
        restSeconds: row.restSeconds,
        side: row.side,
        notes: row.notes,
      })),
    );
    const sets = await tx
      .select()
      .from(routineItemSets)
      .where(
        and(
          eq(routineItemSets.physioId, physioId),
          inArray(routineItemSets.routineItemId, [...itemIds.keys()]),
        ),
      );
    if (sets.length > 0) {
      await tx.insert(routineItemSets).values(
        sets.map((row) => ({
          id: crypto.randomUUID(),
          physioId,
          routineItemId: itemIds.get(row.routineItemId)!,
          position: row.position,
          reps: row.reps,
          repsMax: row.repsMax,
          durationSeconds: row.durationSeconds,
          load: row.load,
        })),
      );
    }
  }
  return ok({ id: copy.id });
}

/**
 * Copies a routine (header, groups, items and sets) under a new name; the copy keeps the source's
 * status and customer. Used by "Make a separate copy" on a weekly plan (spec 06).
 */
export function duplicateRoutine(
  tx: Tx,
  physioId: string,
  sourceId: string,
  options: { name: string; isStandalone: boolean; status?: RoutineStatus },
): Promise<Result<{ id: string }, "notFound">> {
  return copyRoutine(tx, physioId, sourceId, (source) => ({
    name: options.name,
    customerId: source.customerId,
    caseId: source.caseId,
    isStandalone: options.isStandalone,
    status: options.status ?? source.status,
    isTemplate: source.isTemplate,
    sourceTemplateId: source.sourceTemplateId,
  }));
}
