import type { JwtPayload } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { physios } from "@/db/schema";

import { adminClient, testClaims } from "./supabase";

export type TestPhysio = { id: string; email: string; claims: JwtPayload };

/** Creates an auth user (the trigger creates the physios row) with a unique email. */
export async function createTestPhysio(
  options: { onboarded?: boolean; handle?: string; userMetadata?: Record<string, unknown> } = {},
): Promise<TestPhysio> {
  const email = `int-${crypto.randomUUID()}@example.test`;
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: options.userMetadata ?? {},
  });
  if (error) throw error;
  const id = data.user.id;

  if (options.onboarded || options.handle) {
    await db
      .update(physios)
      .set({
        handle: options.handle ?? `int-${id.slice(0, 8)}`,
        ...(options.onboarded ? { onboardedAt: new Date() } : {}),
      })
      .where(eq(physios.id, id));
  }
  return { id, email, claims: testClaims(id, email) };
}

export async function deleteTestPhysios(...testPhysios: TestPhysio[]): Promise<void> {
  await Promise.all(testPhysios.map((physio) => adminClient.auth.admin.deleteUser(physio.id)));
}
