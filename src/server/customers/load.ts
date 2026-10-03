import "server-only";

import { cache } from "react";

import { withPhysio } from "@/server/auth/session";
import { getProfile } from "@/server/physios/queries";

import { getCustomer } from "./queries";
import { idSchema } from "./schemas";

/**
 * The signed-in physio's customer (with cases) plus their time zone, or null for a malformed
 * or foreign id. Memoised per request so `generateMetadata` and the page share one query.
 */
export const loadCustomer = cache(async (rawId: string) => {
  const parsed = idSchema.safeParse(rawId);
  if (!parsed.success) return null;
  return withPhysio(async (tx, physioId) => {
    const [customer, profile] = await Promise.all([
      getCustomer(tx, physioId, parsed.data),
      getProfile(tx, physioId),
    ]);
    if (!customer) return null;
    return { customer, timezone: profile?.timezone ?? "UTC" };
  });
});
