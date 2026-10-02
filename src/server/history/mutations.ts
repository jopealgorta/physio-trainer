import "server-only";

import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import type { Tx } from "@/db/rls";
import {
  exercises,
  routines,
  routineVersions,
  weeklyPlanEntries,
  weeklyPlans,
  weeklyPlanVersions,
} from "@/db/schema";
import { planRestoreEntries, routineRestoreInput } from "@/lib/history/restore";
import { lockPlan } from "@/server/plans/mutations";
import { saveRoutine } from "@/server/routines/mutations";
import { isUuid, saveRoutineSchema } from "@/server/routines/schemas";

import { recordPlanVersion } from "./record";
import type { RestoreError, Result } from "./schemas";

type Restored = Result<{ version: number; dropped: number }, RestoreError>;

const fail = <E extends RestoreError>(error: E) => ({ ok: false, error }) as const;

/**
 * Writes an older routine version back as the current state through the normal save path, which
 * records it as a new `restored` version (spec 15 rule 4). Content only: status and case stay as
 * they are now. Items whose exercise was deleted are dropped (archived exercises are kept).
 */
export async function restoreRoutineVersion(
  tx: Tx,
  physioId: string,
  { id, version }: { id: string; version: number },
): Promise<Restored> {
  if (!isUuid(id)) return fail("notFound");
  const [routine] = await tx
    .select({ version: routines.version, status: routines.status, caseId: routines.caseId })
    .from(routines)
    .where(and(eq(routines.physioId, physioId), eq(routines.id, id)))
    .for("update");
  if (!routine) return fail("notFound");

  const [row] = await tx
    .select({ snapshot: routineVersions.snapshot })
    .from(routineVersions)
    .where(
      and(
        eq(routineVersions.physioId, physioId),
        eq(routineVersions.routineId, id),
        eq(routineVersions.version, version),
      ),
    );
  if (!row) return fail("versionNotFound");

  const exerciseIds = [...new Set(row.snapshot.items.map((item) => item.exercise.id))];
  const existing =
    exerciseIds.length === 0
      ? []
      : await tx
          .select({ id: exercises.id })
          .from(exercises)
          .where(and(eq(exercises.physioId, physioId), inArray(exercises.id, exerciseIds)));
  const { input, dropped } = routineRestoreInput(
    row.snapshot,
    { id, ...routine },
    new Set(existing.map((exercise) => exercise.id)),
  );
  const parsed = saveRoutineSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");

  const saved = await saveRoutine(tx, physioId, parsed.data, {
    kind: "restored",
    restoredFrom: version,
  });
  if (!saved.ok) {
    const { error } = saved;
    return fail(
      error === "notFound" || error === "conflict" || error === "needsItems" ? error : "invalid",
    );
  }
  return { ok: true, data: { version: saved.data.version, dropped } };
}

/**
 * Writes an older plan version back: its name, notes and entries (fresh entry ids). Entries whose
 * routine was deleted, archived or no longer belongs to the plan's customer are dropped. Status,
 * case and the phase window stay as they are now.
 */
export async function restorePlanVersion(
  tx: Tx,
  physioId: string,
  { id, version }: { id: string; version: number },
): Promise<Restored> {
  const plan = await lockPlan(tx, physioId, id);
  if (!plan) return fail("notFound");

  const [row] = await tx
    .select({ snapshot: weeklyPlanVersions.snapshot })
    .from(weeklyPlanVersions)
    .where(
      and(
        eq(weeklyPlanVersions.physioId, physioId),
        eq(weeklyPlanVersions.weeklyPlanId, plan.id),
        eq(weeklyPlanVersions.version, version),
      ),
    );
  if (!row) return fail("versionNotFound");

  const routineIds = [...new Set(row.snapshot.entries.map((entry) => entry.routine.id))];
  // Same physio and same customer (null equals null: a template plan takes template routines).
  const usable =
    routineIds.length === 0
      ? []
      : await tx
          .select({ id: routines.id })
          .from(routines)
          .where(
            and(
              eq(routines.physioId, physioId),
              inArray(routines.id, routineIds),
              ne(routines.status, "archived"),
              plan.customerId === null
                ? isNull(routines.customerId)
                : eq(routines.customerId, plan.customerId),
            ),
          );
  const { entries, dropped } = planRestoreEntries(
    row.snapshot,
    new Set(usable.map((routine) => routine.id)),
  );
  // A template can be active while empty (see updatePlan).
  if (plan.status === "active" && !plan.isTemplate && entries.length === 0) {
    return fail("needsEntries");
  }

  await tx
    .delete(weeklyPlanEntries)
    .where(
      and(eq(weeklyPlanEntries.physioId, physioId), eq(weeklyPlanEntries.weeklyPlanId, plan.id)),
    );
  if (entries.length > 0) {
    await tx.insert(weeklyPlanEntries).values(
      entries.map((entry) => ({
        id: crypto.randomUUID(),
        physioId,
        weeklyPlanId: plan.id,
        ...entry,
      })),
    );
  }
  const [saved] = await tx
    .update(weeklyPlans)
    .set({
      name: row.snapshot.plan.name,
      notes: row.snapshot.plan.notes,
      version: sql`${weeklyPlans.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(weeklyPlans.physioId, physioId), eq(weeklyPlans.id, plan.id)))
    .returning({ version: weeklyPlans.version });
  await recordPlanVersion(tx, physioId, plan.id, { kind: "restored", restoredFrom: version });
  return { ok: true, data: { version: saved.version, dropped } };
}
