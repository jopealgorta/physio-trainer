import "server-only";

import { cache } from "react";

import { withPhysio } from "@/server/auth/session";

import { getRoutine } from "./queries";
import { idSchema } from "./schemas";

/** One load per request, shared by `generateMetadata` and the page. Null when not found. */
export const loadRoutine = cache(async (rawId: string) => {
  const parsed = idSchema.safeParse(rawId);
  if (!parsed.success) return null;
  return withPhysio((tx, physioId) => getRoutine(tx, physioId, parsed.data));
});
