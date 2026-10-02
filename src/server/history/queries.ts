import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import type { Tx } from "@/db/rls";
import { routines, routineVersions, weeklyPlans, weeklyPlanVersions } from "@/db/schema";
import type { PlanSnapshot, RoutineSnapshot } from "@/lib/history/snapshot";

import { isUuid } from "@/server/routines/schemas";

import type { HistoryTarget, VersionMeta } from "./schemas";

async function targetExists(tx: Tx, physioId: string, target: HistoryTarget): Promise<boolean> {
  if (!isUuid(target.id)) return false;
  const [row] =
    target.kind === "routine"
      ? await tx
          .select({ id: routines.id })
          .from(routines)
          .where(and(eq(routines.physioId, physioId), eq(routines.id, target.id)))
      : await tx
          .select({ id: weeklyPlans.id })
          .from(weeklyPlans)
          .where(and(eq(weeklyPlans.physioId, physioId), eq(weeklyPlans.id, target.id)));
  return row !== undefined;
}

/** The history list, newest first. Null when the routine/plan is not the physio's. */
export async function listVersions(
  tx: Tx,
  physioId: string,
  target: HistoryTarget,
): Promise<VersionMeta[] | null> {
  if (!(await targetExists(tx, physioId, target))) return null;
  if (target.kind === "routine") {
    const rows = await tx
      .select({
        version: routineVersions.version,
        kind: routineVersions.kind,
        restoredFrom: routineVersions.restoredFrom,
        summary: routineVersions.summary,
        at: routineVersions.createdAt,
      })
      .from(routineVersions)
      .where(and(eq(routineVersions.physioId, physioId), eq(routineVersions.routineId, target.id)))
      .orderBy(desc(routineVersions.version));
    return rows.map((row) => ({ ...row, at: row.at.toISOString() }));
  }
  // A coalesced plan version moves forward in time: its last update is when it happened.
  const rows = await tx
    .select({
      version: weeklyPlanVersions.version,
      kind: weeklyPlanVersions.kind,
      restoredFrom: weeklyPlanVersions.restoredFrom,
      summary: weeklyPlanVersions.summary,
      at: weeklyPlanVersions.updatedAt,
    })
    .from(weeklyPlanVersions)
    .where(
      and(
        eq(weeklyPlanVersions.physioId, physioId),
        eq(weeklyPlanVersions.weeklyPlanId, target.id),
      ),
    )
    .orderBy(desc(weeklyPlanVersions.version));
  return rows.map((row) => ({ ...row, at: row.at.toISOString() }));
}

/** Snapshots of the requested versions, keyed by version; missing ones are left out. */
export async function getSnapshots(
  tx: Tx,
  physioId: string,
  target: HistoryTarget,
  versions: number[],
): Promise<Record<number, RoutineSnapshot | PlanSnapshot>> {
  if (!isUuid(target.id) || versions.length === 0) return {};
  const rows =
    target.kind === "routine"
      ? await tx
          .select({ version: routineVersions.version, snapshot: routineVersions.snapshot })
          .from(routineVersions)
          .where(
            and(
              eq(routineVersions.physioId, physioId),
              eq(routineVersions.routineId, target.id),
              inArray(routineVersions.version, versions),
            ),
          )
      : await tx
          .select({ version: weeklyPlanVersions.version, snapshot: weeklyPlanVersions.snapshot })
          .from(weeklyPlanVersions)
          .where(
            and(
              eq(weeklyPlanVersions.physioId, physioId),
              eq(weeklyPlanVersions.weeklyPlanId, target.id),
              inArray(weeklyPlanVersions.version, versions),
            ),
          );
  return Object.fromEntries(rows.map((row) => [row.version, row.snapshot]));
}
