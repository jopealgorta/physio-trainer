import "server-only";

import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";

import type { Tx } from "@/db/rls";
import {
  exercises,
  routineGroups,
  routineItemSets,
  routineItems,
  routines,
  routineVersions,
  weeklyPlanEntries,
  weeklyPlans,
  weeklyPlanVersions,
} from "@/db/schema";
import { diffPlans, diffRoutines } from "@/lib/history/diff";
import {
  SNAPSHOT_SCHEMA,
  type PlanSnapshot,
  type RoutineSnapshot,
  type SnapshotSet,
  type VersionKind,
} from "@/lib/history/snapshot";
import { summarizePlan, summarizeRoutine } from "@/lib/history/summary";

/**
 * Version snapshots (spec 15), written in the caller's transaction right after a write has
 * bumped (or created) the routine/plan, so a failed write rolls its snapshot back with it.
 */
export type RecordOptions = { kind: VersionKind; restoredFrom?: number };

/** The session of the request (null outside one), read from the claims runAsPhysio set. */
const currentSession = sql<
  string | null
>`(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'session_id')::uuid`;

async function routineState(tx: Tx, physioId: string, routineId: string) {
  const [routine] = await tx
    .select({
      version: routines.version,
      name: routines.name,
      notes: routines.notes,
      status: routines.status,
      caseId: routines.caseId,
      sessionsPerWeek: routines.sessionsPerWeek,
      sessionsPerDay: routines.sessionsPerDay,
      phaseLabel: routines.phaseLabel,
      startsOn: routines.startsOn,
      endsOn: routines.endsOn,
    })
    .from(routines)
    .where(and(eq(routines.physioId, physioId), eq(routines.id, routineId)));
  if (!routine) throw new Error("routine not found while recording a version");
  const { version, ...header } = routine;

  const items = await tx
    .select({
      id: routineItems.id,
      position: routineItems.position,
      groupId: routineItems.groupId,
      holdSeconds: routineItems.holdSeconds,
      restSeconds: routineItems.restSeconds,
      side: routineItems.side,
      notes: routineItems.notes,
      exercise: {
        id: exercises.id,
        name: exercises.name,
        instructions: exercises.instructions,
      },
    })
    .from(routineItems)
    .innerJoin(
      exercises,
      and(eq(exercises.physioId, routineItems.physioId), eq(exercises.id, routineItems.exerciseId)),
    )
    .where(and(eq(routineItems.physioId, physioId), eq(routineItems.routineId, routineId)))
    .orderBy(asc(routineItems.position));

  const groupRest = new Map(
    (
      await tx
        .select({ id: routineGroups.id, restSeconds: routineGroups.restSeconds })
        .from(routineGroups)
        .where(and(eq(routineGroups.physioId, physioId), eq(routineGroups.routineId, routineId)))
    ).map((group) => [group.id, group.restSeconds]),
  );

  const setsByItem = new Map<string, SnapshotSet[]>();
  if (items.length > 0) {
    const sets = await tx
      .select({
        itemId: routineItemSets.routineItemId,
        reps: routineItemSets.reps,
        repsMax: routineItemSets.repsMax,
        durationSeconds: routineItemSets.durationSeconds,
        load: routineItemSets.load,
        distanceMeters: routineItemSets.distanceMeters,
        intensity: routineItemSets.intensity,
      })
      .from(routineItemSets)
      .where(
        and(
          eq(routineItemSets.physioId, physioId),
          inArray(
            routineItemSets.routineItemId,
            items.map((row) => row.id),
          ),
        ),
      )
      .orderBy(asc(routineItemSets.position));
    for (const { itemId, ...set } of sets) {
      setsByItem.set(itemId, [...(setsByItem.get(itemId) ?? []), set]);
    }
  }

  // Group ids are fresh on every save: key groups by first appearance instead.
  const groupKeys = new Map<string, string>();
  for (const row of items) {
    if (row.groupId !== null && !groupKeys.has(row.groupId)) {
      groupKeys.set(row.groupId, `g${groupKeys.size}`);
    }
  }

  const snapshot: RoutineSnapshot = {
    schema: SNAPSHOT_SCHEMA,
    routine: header,
    groups: [...groupKeys].map(([id, key]) => ({ key, restSeconds: groupRest.get(id) ?? null })),
    items: items.map((row) => ({
      exercise: row.exercise,
      position: row.position,
      prescription: {
        groupKey: row.groupId === null ? null : groupKeys.get(row.groupId)!,
        holdSeconds: row.holdSeconds,
        restSeconds: row.restSeconds,
        side: row.side,
        notes: row.notes,
        sets: setsByItem.get(row.id) ?? [],
      },
    })),
  };
  return { version, snapshot };
}

export async function buildRoutineSnapshot(
  tx: Tx,
  physioId: string,
  routineId: string,
): Promise<RoutineSnapshot> {
  return (await routineState(tx, physioId, routineId)).snapshot;
}

/** Inserts the routine's current version (routine saves never coalesce). */
export async function recordRoutineVersion(
  tx: Tx,
  physioId: string,
  routineId: string,
  options: RecordOptions,
): Promise<void> {
  const { version, snapshot } = await routineState(tx, physioId, routineId);
  let summary = null;
  if (options.kind !== "created") {
    const [previous] = await tx
      .select({ snapshot: routineVersions.snapshot })
      .from(routineVersions)
      .where(
        and(
          eq(routineVersions.physioId, physioId),
          eq(routineVersions.routineId, routineId),
          lt(routineVersions.version, version),
        ),
      )
      .orderBy(desc(routineVersions.version))
      .limit(1);
    if (previous) summary = summarizeRoutine(diffRoutines(previous.snapshot, snapshot));
  }
  await tx.insert(routineVersions).values({
    physioId,
    routineId,
    version,
    kind: options.kind,
    restoredFrom: options.restoredFrom ?? null,
    snapshot,
    summary,
  });
}

async function planState(tx: Tx, physioId: string, planId: string) {
  const [plan] = await tx
    .select({
      version: weeklyPlans.version,
      name: weeklyPlans.name,
      notes: weeklyPlans.notes,
      status: weeklyPlans.status,
      caseId: weeklyPlans.caseId,
      phaseLabel: weeklyPlans.phaseLabel,
      startsOn: weeklyPlans.startsOn,
      endsOn: weeklyPlans.endsOn,
    })
    .from(weeklyPlans)
    .where(and(eq(weeklyPlans.physioId, physioId), eq(weeklyPlans.id, planId)));
  if (!plan) throw new Error("plan not found while recording a version");
  const { version, ...header } = plan;

  const entries = await tx
    .select({
      id: weeklyPlanEntries.id,
      weekday: weeklyPlanEntries.weekday,
      position: weeklyPlanEntries.position,
      label: weeklyPlanEntries.label,
      routine: { id: routines.id, name: routines.name, version: routines.version },
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
      and(eq(weeklyPlanEntries.physioId, physioId), eq(weeklyPlanEntries.weeklyPlanId, planId)),
    )
    .orderBy(asc(weeklyPlanEntries.weekday), asc(weeklyPlanEntries.position));

  const snapshot: PlanSnapshot = { schema: SNAPSHOT_SCHEMA, plan: header, entries };
  return { version, snapshot };
}

export async function buildPlanSnapshot(
  tx: Tx,
  physioId: string,
  planId: string,
): Promise<PlanSnapshot> {
  return (await planState(tx, physioId, planId)).snapshot;
}

/**
 * Records the plan's current version. Board actions are frequent, so an edit coalesces into the
 * latest row (moving it to this version) when that row is an edit by the same session less than
 * five minutes old; the coalesced summary is diffed against the row before it.
 */
export async function recordPlanVersion(
  tx: Tx,
  physioId: string,
  planId: string,
  options: RecordOptions,
): Promise<void> {
  const { version, snapshot } = await planState(tx, physioId, planId);
  const latestRows = (before?: number) =>
    tx
      .select({
        id: weeklyPlanVersions.id,
        version: weeklyPlanVersions.version,
        kind: weeklyPlanVersions.kind,
        snapshot: weeklyPlanVersions.snapshot,
        fresh: sql<boolean>`${weeklyPlanVersions.sessionId} is not distinct from ${currentSession}
          and ${weeklyPlanVersions.updatedAt} > now() - interval '5 minutes'`,
      })
      .from(weeklyPlanVersions)
      .where(
        and(
          eq(weeklyPlanVersions.physioId, physioId),
          eq(weeklyPlanVersions.weeklyPlanId, planId),
          lt(weeklyPlanVersions.version, before ?? version),
        ),
      )
      .orderBy(desc(weeklyPlanVersions.version))
      .limit(1);

  const [latest] = await latestRows().for("update");
  const coalesce = options.kind === "edited" && latest?.kind === "edited" && latest.fresh;
  const previous = coalesce ? (await latestRows(latest.version))[0] : latest;
  const summary =
    options.kind !== "created" && previous
      ? summarizePlan(diffPlans(previous.snapshot, snapshot))
      : null;

  if (coalesce) {
    // updated_at is bumped by the table's trigger.
    await tx
      .update(weeklyPlanVersions)
      .set({ version, snapshot, summary, sessionId: currentSession })
      .where(and(eq(weeklyPlanVersions.physioId, physioId), eq(weeklyPlanVersions.id, latest.id)));
    return;
  }
  await tx.insert(weeklyPlanVersions).values({
    physioId,
    weeklyPlanId: planId,
    version,
    kind: options.kind,
    restoredFrom: options.restoredFrom ?? null,
    snapshot,
    summary,
    sessionId: currentSession,
  });
}
