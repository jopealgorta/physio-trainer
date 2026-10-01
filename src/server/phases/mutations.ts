import "server-only";

import { and, eq, sql } from "drizzle-orm";

import type { Tx } from "@/db/rls";
import { routines, weeklyPlanEntries, weeklyPlans } from "@/db/schema";
import { endPredecessor } from "@/lib/phases";
import { duplicateRoutine } from "@/server/routines/mutations";

import { isUuid, type CopyPhaseInput, type PhaseError, type SetPhaseInput } from "./schemas";

const ok = <T>(data: T) => ({ ok: true, data }) as const;
const fail = <E extends string>(error: E) => ({ ok: false, error }) as const;

type Outcome<T> = { ok: true; data: T } | { ok: false; error: PhaseError };

/**
 * Sets a routine's or plan's label and date window. Schedule metadata, not content: it does not
 * bump `version`, so an open editor or board is never made stale by it. Only standalone routines
 * carry a window (a routine inside a plan follows its plan), and templates carry none.
 */
export async function setPhase(
  tx: Tx,
  physioId: string,
  input: SetPhaseInput,
): Promise<Outcome<Record<string, never>>> {
  if (!isUuid(input.id)) return fail("notFound");
  const values = { phaseLabel: input.phaseLabel, startsOn: input.startsOn, endsOn: input.endsOn };

  if (input.kind === "routine") {
    const [routine] = await tx
      .select({ isStandalone: routines.isStandalone })
      .from(routines)
      .where(and(eq(routines.physioId, physioId), eq(routines.id, input.id)))
      .for("update");
    if (!routine) return fail("notFound");
    if (!routine.isStandalone) return fail("notStandalone");
    await tx
      .update(routines)
      .set(values)
      .where(and(eq(routines.physioId, physioId), eq(routines.id, input.id)));
    return ok({});
  }

  const [plan] = await tx
    .select({ customerId: weeklyPlans.customerId })
    .from(weeklyPlans)
    .where(and(eq(weeklyPlans.physioId, physioId), eq(weeklyPlans.id, input.id)))
    .for("update");
  if (!plan) return fail("notFound");
  if (plan.customerId === null) return fail("needsCustomer");
  await tx
    .update(weeklyPlans)
    .set(values)
    .where(and(eq(weeklyPlans.physioId, physioId), eq(weeklyPlans.id, input.id)));
  return ok({});
}

/**
 * "Copy into next phase" (spec 08). Clones the routine, or the plan with its routines deep-copied
 * (a routine shared by several entries stays shared in the copy), links the clone to its
 * predecessor with `previous_id` and gives it the new label and window. The copy is active when
 * its source is and can be (items/entries present, nothing archived), otherwise a draft. With
 * `endCurrent` the predecessor ends the day before the copy starts. One transaction: the caller's.
 */
export async function copyIntoNextPhase(
  tx: Tx,
  physioId: string,
  input: CopyPhaseInput,
): Promise<Outcome<{ id: string }>> {
  if (!isUuid(input.id)) return fail("notFound");
  return input.kind === "routine"
    ? copyRoutinePhase(tx, physioId, input)
    : copyPlanPhase(tx, physioId, input);
}

const windowOf = (input: CopyPhaseInput) => ({
  phaseLabel: input.phaseLabel,
  startsOn: input.startsOn,
  endsOn: input.endsOn,
});

async function copyRoutinePhase(
  tx: Tx,
  physioId: string,
  input: CopyPhaseInput,
): Promise<Outcome<{ id: string }>> {
  const [source] = await tx
    .select({
      name: routines.name,
      status: routines.status,
      isStandalone: routines.isStandalone,
      startsOn: routines.startsOn,
      endsOn: routines.endsOn,
      itemCount: sql<number>`(
        select count(*)::int from routine_items i
        where i.physio_id = routines.physio_id and i.routine_id = routines.id)`,
    })
    .from(routines)
    .where(and(eq(routines.physioId, physioId), eq(routines.id, input.id)))
    .for("update");
  if (!source) return fail("notFound");
  if (!source.isStandalone) return fail("notStandalone");

  const predecessor =
    input.endCurrent && source.status === "active" ? endPredecessor(source, input.startsOn) : null;
  if (predecessor && !predecessor.ok) return fail("startBeforePredecessor");

  const status = source.status === "active" && source.itemCount > 0 ? "active" : "draft";
  const copy = await duplicateRoutine(tx, physioId, input.id, {
    name: source.name,
    isStandalone: true,
    status,
    phase: { ...windowOf(input), previousId: input.id },
  });
  if (!copy.ok) return fail("notFound");

  if (predecessor?.ok) {
    await tx
      .update(routines)
      .set({ endsOn: predecessor.endsOn })
      .where(and(eq(routines.physioId, physioId), eq(routines.id, input.id)));
  }
  return ok({ id: copy.data.id });
}

async function copyPlanPhase(
  tx: Tx,
  physioId: string,
  input: CopyPhaseInput,
): Promise<Outcome<{ id: string }>> {
  const [source] = await tx
    .select()
    .from(weeklyPlans)
    .where(and(eq(weeklyPlans.physioId, physioId), eq(weeklyPlans.id, input.id)))
    .for("update");
  if (!source) return fail("notFound");
  if (source.customerId === null) return fail("needsCustomer");

  const predecessor =
    input.endCurrent && source.status === "active" ? endPredecessor(source, input.startsOn) : null;
  if (predecessor && !predecessor.ok) return fail("startBeforePredecessor");

  const entries = await tx
    .select({
      weekday: weeklyPlanEntries.weekday,
      position: weeklyPlanEntries.position,
      label: weeklyPlanEntries.label,
      routineId: weeklyPlanEntries.routineId,
      routineName: routines.name,
      routineStatus: routines.status,
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
      and(eq(weeklyPlanEntries.physioId, physioId), eq(weeklyPlanEntries.weeklyPlanId, input.id)),
    );

  const canBeActive =
    entries.length > 0 && entries.every((entry) => entry.routineStatus !== "archived");
  const [copy] = await tx
    .insert(weeklyPlans)
    .values({
      physioId,
      customerId: source.customerId,
      caseId: source.caseId,
      name: source.name,
      notes: source.notes,
      status: source.status === "active" && canBeActive ? "active" : "draft",
      ...windowOf(input),
      previousId: input.id,
    })
    .returning({ id: weeklyPlans.id });

  // Each routine is copied once, so entries that shared a routine still share its copy. The
  // copies belong to the new plan: not standalone, and without phase fields of their own.
  const copies = new Map<string, string>();
  for (const { routineId, routineName } of entries) {
    if (copies.has(routineId)) continue;
    const duplicated = await duplicateRoutine(tx, physioId, routineId, {
      name: routineName,
      isStandalone: false,
    });
    // Unreachable (the entry join just found the routine), but a returned failure would commit
    // the half-built copy, so abort the transaction instead.
    if (!duplicated.ok) throw new Error("routine vanished during a phase copy");
    copies.set(routineId, duplicated.data.id);
  }
  if (entries.length > 0) {
    await tx.insert(weeklyPlanEntries).values(
      entries.map((entry) => ({
        physioId,
        weeklyPlanId: copy.id,
        weekday: entry.weekday,
        position: entry.position,
        label: entry.label,
        routineId: copies.get(entry.routineId)!,
      })),
    );
  }

  if (predecessor?.ok) {
    await tx
      .update(weeklyPlans)
      .set({ endsOn: predecessor.endsOn })
      .where(and(eq(weeklyPlans.physioId, physioId), eq(weeklyPlans.id, input.id)));
  }
  return ok({ id: copy.id });
}
