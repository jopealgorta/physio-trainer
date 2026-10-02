"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { COMMENTS_LIMIT } from "@/lib/session-logs";
import { withPhysio } from "@/server/auth/session";
import { idSchema } from "@/server/customers/schemas";

import { markCommentsSeen } from "./mutations";

const idsSchema = z.array(z.uuid()).max(COMMENTS_LIMIT);

/**
 * Called by the Activity tab once it has shown the comments: clears the "new" badge of the ones it
 * showed (`ids`) and the dashboard's "New comments" card. The tab is a read; the write happens
 * here, not while rendering.
 */
export async function markCommentsSeenAction(
  customerId: string,
  ids: string[],
): Promise<{ ok: boolean }> {
  const customer = idSchema.safeParse(customerId);
  const parsedIds = idsSchema.safeParse(ids);
  if (!customer.success || !parsedIds.success) return { ok: false };
  const marked = await withPhysio((tx, physioId) =>
    markCommentsSeen(tx, physioId, customer.data, parsedIds.data),
  );
  if (marked > 0) revalidatePath("/dashboard");
  return { ok: true };
}
