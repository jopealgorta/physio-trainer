/* eslint-disable @typescript-eslint/no-unused-vars -- placeholder until spec 06 fills it in */
import "server-only";

import type { Tx } from "@/db/rls";

/**
 * Plans that schedule this routine. Spec 06 (weekly plans) reads plan_days here so a routine that
 * plans use cannot be archived; until then no plan can reference a routine.
 */
export async function listPlansUsingRoutine(
  _tx: Tx,
  _physioId: string,
  _routineId: string,
): Promise<{ id: string; name: string }[]> {
  // TODO(spec 06): query the plans that use this routine.
  return [];
}
