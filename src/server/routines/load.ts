import "server-only";

import { cache } from "react";

import { DEFAULT_LIBRARY_FILTERS } from "@/lib/library-params";
import { withPhysio } from "@/server/auth/session";
import { listCategoryTree, listExercises } from "@/server/library/queries";
import { getProfile } from "@/server/physios/queries";
import { listAssignableCustomers } from "@/server/templates/queries";

import { getRoutine, listRecentExercises } from "./queries";
import { idSchema } from "./schemas";

/** Exercises shown in the picker before the physio searches. */
const PICKER_INITIAL_LIMIT = 60;

/**
 * Everything the routine page needs, in one transaction (independent reads are pipelined).
 * One load per request, shared by `generateMetadata` and the page. Null when not found.
 */
export const loadRoutine = cache(async (rawId: string) => {
  const parsed = idSchema.safeParse(rawId);
  if (!parsed.success) return null;
  return withPhysio(async (tx, physioId) => {
    const [routine, profile, categories, recent, initial] = await Promise.all([
      getRoutine(tx, physioId, parsed.data),
      getProfile(tx, physioId),
      listCategoryTree(tx, physioId),
      listRecentExercises(tx, physioId),
      listExercises(tx, physioId, DEFAULT_LIBRARY_FILTERS, PICKER_INITIAL_LIMIT),
    ]);
    if (!routine) return null;
    // Only a template is assigned from its page.
    const customers = routine.isTemplate ? await listAssignableCustomers(tx, physioId) : [];
    return {
      routine,
      timeZone: profile?.timezone ?? "UTC",
      categories,
      recent,
      exercises: initial.exercises,
      customers,
    };
  });
});
