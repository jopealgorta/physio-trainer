"use server";

import { revalidatePath } from "next/cache";

import { withPhysio } from "@/server/auth/session";
import { idSchema } from "@/server/customers/schemas";

import { markCommentsSeen } from "./mutations";

/**
 * Called by the Activity tab once it has shown the comments: clears their "new" badges and the
 * dashboard's "New comments" card. The tab is a read; the write happens here, not while rendering.
 */
export async function markCommentsSeenAction(customerId: string): Promise<{ ok: boolean }> {
  const parsed = idSchema.safeParse(customerId);
  if (!parsed.success) return { ok: false };
  const marked = await withPhysio((tx, physioId) => markCommentsSeen(tx, physioId, parsed.data));
  if (marked > 0) revalidatePath("/dashboard");
  return { ok: true };
}
