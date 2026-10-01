import "server-only";

import { and, asc, eq } from "drizzle-orm";

import type { Tx } from "@/db/rls";
import { weeklyPlanEntries, weeklyPlans } from "@/db/schema";

import type { PlanRef } from "./schemas";

/**
 * Active weekly plans that schedule this routine (spec 06). A routine they use cannot be
 * archived; the save path names them in the error.
 */
export async function listPlansUsingRoutine(
  tx: Tx,
  physioId: string,
  routineId: string,
): Promise<PlanRef[]> {
  return tx
    .selectDistinct({ id: weeklyPlans.id, name: weeklyPlans.name })
    .from(weeklyPlanEntries)
    .innerJoin(
      weeklyPlans,
      and(
        eq(weeklyPlans.physioId, weeklyPlanEntries.physioId),
        eq(weeklyPlans.id, weeklyPlanEntries.weeklyPlanId),
      ),
    )
    .where(
      and(
        eq(weeklyPlanEntries.physioId, physioId),
        eq(weeklyPlanEntries.routineId, routineId),
        eq(weeklyPlans.status, "active"),
      ),
    )
    .orderBy(asc(weeklyPlans.name), asc(weeklyPlans.id));
}
