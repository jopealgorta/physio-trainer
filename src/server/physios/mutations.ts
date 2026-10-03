import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { isUniqueViolation } from "@/db/errors";
import type { Tx } from "@/db/rls";
import { physios, type Physio } from "@/db/schema";

import type { ProfileInput } from "./schemas";

export type ProfileResult =
  { ok: true; data: Physio } | { ok: false; error: "handleTaken" | "notFound" };

export function completeOnboarding(tx: Tx, physioId: string, input: ProfileInput) {
  return saveProfile(tx, physioId, input, { onboard: true });
}

export function updateProfile(tx: Tx, physioId: string, input: ProfileInput) {
  return saveProfile(tx, physioId, input, { onboard: false });
}

/**
 * Stores the sign-in provider's photo (post-sign-in step). Writes only when it changed, so an
 * unchanged photo does not bump `updated_at` (which versions cached link previews, spec 11).
 */
export async function setAvatarUrl(tx: Tx, physioId: string, avatarUrl: string): Promise<void> {
  await tx
    .update(physios)
    .set({ avatarUrl })
    .where(and(eq(physios.id, physioId), sql`${physios.avatarUrl} is distinct from ${avatarUrl}`));
}

async function saveProfile(
  tx: Tx,
  physioId: string,
  input: ProfileInput,
  { onboard }: { onboard: boolean },
): Promise<ProfileResult> {
  try {
    // A savepoint, so a unique violation does not abort the caller's transaction.
    const [row] = await tx.transaction((savepoint) =>
      savepoint
        .update(physios)
        .set({
          ...input,
          ...(onboard ? { onboardedAt: sql`coalesce(${physios.onboardedAt}, now())` } : {}),
        })
        .where(eq(physios.id, physioId))
        .returning(),
    );
    return row ? { ok: true, data: row } : { ok: false, error: "notFound" };
  } catch (error) {
    if (isUniqueViolation(error, "physios_handle_unique"))
      return { ok: false, error: "handleTaken" };
    throw error;
  }
}
