"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { COMMENTS_LIMIT } from "@/lib/session-logs";
import { withPhysio } from "@/server/auth/session";
import { idSchema } from "@/server/customers/schemas";

import { markCommentsSeen, markExerciseCommentsSeen } from "./mutations";

const idsSchema = z.array(z.uuid()).max(COMMENTS_LIMIT);

/**
 * Called by the Activity tab once it has shown the comments: clears the "new" badge of the ones it
 * showed (`ids`, and `exerciseIds` for exercise logs) and the dashboard's "New comments" card. The tab is a read; the write happens
 * here, not while rendering.
 */
export async function markCommentsSeenAction(
  customerId: string,
  ids: string[],
  exerciseIds: string[] = [],
): Promise<{ ok: boolean }> {
  const customer = idSchema.safeParse(customerId);
  const parsedIds = idsSchema.safeParse(ids);
  const parsedExerciseIds = idsSchema.safeParse(exerciseIds);
  if (!customer.success || !parsedIds.success || !parsedExerciseIds.success) return { ok: false };
  const marked = await withPhysio(async (tx, physioId) => {
    const [sessions, exercises] = await Promise.all([
      markCommentsSeen(tx, physioId, customer.data, parsedIds.data),
      markExerciseCommentsSeen(tx, physioId, customer.data, parsedExerciseIds.data),
    ]);
    return sessions + exercises;
  });
  if (marked > 0) revalidatePath("/dashboard");
  return { ok: true };
}
