import "server-only";

import { cache } from "react";

import { withPhysio } from "@/server/auth/session";
import { getProfile } from "@/server/physios/queries";
import { listAssignableCustomers } from "@/server/templates/queries";

import { getPlan, listAttachableRoutines } from "./queries";
import { idSchema } from "./schemas";

/**
 * Everything the plan page needs, in one transaction (independent reads are pipelined).
 * One load per request, shared by `generateMetadata` and the page. Null when not found.
 */
export const loadPlan = cache(async (rawId: string) => {
  const parsed = idSchema.safeParse(rawId);
  if (!parsed.success) return null;
  return withPhysio(async (tx, physioId) => {
    const [plan, profile] = await Promise.all([
      getPlan(tx, physioId, parsed.data),
      getProfile(tx, physioId),
    ]);
    if (!plan) return null;
    const [routines, customers] = await Promise.all([
      // Template plans (no customer) attach template routines.
      listAttachableRoutines(tx, physioId, plan.customerId),
      // Only a template is assigned from its page.
      plan.isTemplate ? listAssignableCustomers(tx, physioId) : [],
    ]);
    return { plan, routines, customers, timeZone: profile?.timezone ?? "UTC" };
  });
});
