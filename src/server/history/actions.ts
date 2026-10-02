"use server";

import { revalidatePath } from "next/cache";

import type { PlanSnapshot, RoutineSnapshot } from "@/lib/history/snapshot";
import { withPhysio } from "@/server/auth/session";

import { restorePlanVersion, restoreRoutineVersion } from "./mutations";
import { getSnapshots, listVersions } from "./queries";
import {
  historyTargetSchema,
  restoreSchema,
  versionsRequestSchema,
  type RestoreError,
  type Result,
  type VersionMeta,
} from "./schemas";

export async function listVersionsAction(
  input: unknown,
): Promise<Result<VersionMeta[], "notFound" | "invalid">> {
  const parsed = historyTargetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const versions = await withPhysio((tx, physioId) => listVersions(tx, physioId, parsed.data));
  return versions ? { ok: true, data: versions } : { ok: false, error: "notFound" };
}

/** One version to show or two to compare; notFound unless every one of them exists. */
export async function getSnapshotsAction(
  input: unknown,
): Promise<Result<Record<number, RoutineSnapshot | PlanSnapshot>, "notFound" | "invalid">> {
  const parsed = versionsRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { versions, ...target } = parsed.data;
  const snapshots = await withPhysio((tx, physioId) =>
    getSnapshots(tx, physioId, target, versions),
  );
  return versions.every((version) => version in snapshots)
    ? { ok: true, data: snapshots }
    : { ok: false, error: "notFound" };
}

export async function restoreVersionAction(
  input: unknown,
): Promise<Result<{ version: number; dropped: number }, RestoreError>> {
  const parsed = restoreSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { kind, id, version } = parsed.data;
  const restore = kind === "routine" ? restoreRoutineVersion : restorePlanVersion;
  const result = await withPhysio((tx, physioId) => restore(tx, physioId, { id, version }));
  if (result.ok) {
    // A routine's name shows on the plans that use it, and a plan's entries on its routines.
    revalidatePath(kind === "routine" ? `/routines/${id}` : `/plans/${id}`);
    revalidatePath("/routines", "layout");
    revalidatePath("/plans", "layout");
    revalidatePath("/customers", "layout");
  }
  return result;
}
