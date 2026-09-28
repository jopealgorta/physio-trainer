import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { physios } from "@/db/schema";
import { isPlaceholderHandle } from "@/lib/handles";
import { adminClient } from "@/test/int/supabase";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";

const created: TestPhysio[] = [];
async function newPhysio(...args: Parameters<typeof createTestPhysio>) {
  const physio = await createTestPhysio(...args);
  created.push(physio);
  return physio;
}
async function rowOf(id: string) {
  const [row] = await db.select().from(physios).where(eq(physios.id, id));
  return row;
}

afterAll(() => deleteTestPhysios(...created));

describe("physios sign-up trigger", () => {
  it("creates a row with a placeholder handle and defaults", async () => {
    const physio = await newPhysio({ userMetadata: { full_name: "Ana Ruiz" } });
    const row = await rowOf(physio.id);
    expect(row).toMatchObject({
      email: physio.email,
      displayName: "Ana Ruiz",
      locale: "en",
      timezone: "UTC",
      onboardedAt: null,
    });
    expect(isPlaceholderHandle(row.handle)).toBe(true);
  });

  it("uses Google's 'name' when 'full_name' is missing", async () => {
    const physio = await newPhysio({ userMetadata: { name: "Leo Park" } });
    expect((await rowOf(physio.id)).displayName).toBe("Leo Park");
  });

  it("falls back to the email local part", async () => {
    const physio = await newPhysio();
    expect((await rowOf(physio.id)).displayName).toBe(physio.email.split("@")[0]);
  });

  it("truncates long names to 80 characters", async () => {
    const physio = await newPhysio({ userMetadata: { full_name: "x".repeat(120) } });
    expect((await rowOf(physio.id)).displayName).toHaveLength(80);
  });

  it("removes the row when the auth user is deleted", async () => {
    const physio = await createTestPhysio();
    await adminClient.auth.admin.deleteUser(physio.id);
    expect(await rowOf(physio.id)).toBeUndefined();
  });
});

describe("physios table", () => {
  it("bumps updated_at on update", async () => {
    const physio = await newPhysio();
    const before = (await rowOf(physio.id)).updatedAt;
    await db.update(physios).set({ displayName: "Updated" }).where(eq(physios.id, physio.id));
    expect((await rowOf(physio.id)).updatedAt.getTime()).toBeGreaterThan(before.getTime());
  });

  it.each(["Bad Handle", "ab", "-edge", "a".repeat(31)])(
    "rejects the handle %j",
    async (handle) => {
      const physio = await newPhysio();
      await expect(
        db.update(physios).set({ handle }).where(eq(physios.id, physio.id)),
      ).rejects.toThrow();
    },
  );

  it("rejects an empty display name", async () => {
    const physio = await newPhysio();
    await expect(
      db.update(physios).set({ displayName: "" }).where(eq(physios.id, physio.id)),
    ).rejects.toThrow();
  });
});
