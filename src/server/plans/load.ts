import "server-only";

import { cache } from "react";

import { withPhysio } from "@/server/auth/session";

import { getPlan, listAttachableRoutines } from "./queries";
import { idSchema } from "./schemas";

/** One load per request, shared by `generateMetadata` and the page. Null when not found. */
export const loadPlan = cache(async (rawId: string) => {
  const parsed = idSchema.safeParse(rawId);
  if (!parsed.success) return null;
  return withPhysio(async (tx, physioId) => {
    const plan = await getPlan(tx, physioId, parsed.data);
    if (!plan) return null;
    const routines = plan.customerId
      ? await listAttachableRoutines(tx, physioId, plan.customerId)
      : [];
    return { plan, routines };
  });
});
