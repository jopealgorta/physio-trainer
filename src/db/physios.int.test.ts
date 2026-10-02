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

  it("copies Google's avatar_url as the profile photo", async () => {
    const url = "https://lh3.googleusercontent.com/a/photo=s96-c";
    const physio = await newPhysio({
      userMetadata: { avatar_url: url, picture: "https://x.test/p" },
    });
    expect((await rowOf(physio.id)).avatarUrl).toBe(url);
  });

  it("falls back to 'picture' when avatar_url is missing", async () => {
    const url = "https://lh3.googleusercontent.com/a/picture";
    const physio = await newPhysio({ userMetadata: { picture: url } });
    expect((await rowOf(physio.id)).avatarUrl).toBe(url);
  });

  it.each([
    ["http", "http://example.test/photo.png"],
    ["javascript", "javascript:alert(1)"],
    ["too long", `https://example.test/${"x".repeat(2048)}`],
    ["not a string", 42],
  ])("ignores a %s photo URL", async (_label, avatarUrl) => {
    const physio = await newPhysio({ userMetadata: { avatar_url: avatarUrl } });
    expect((await rowOf(physio.id)).avatarUrl).toBeNull();
  });

  it("has no photo for a magic-link sign-up", async () => {
    const physio = await newPhysio();
    expect((await rowOf(physio.id)).avatarUrl).toBeNull();
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

  it.each(["http://example.test/a.png", `https://example.test/${"x".repeat(2048)}`])(
    "rejects the avatar URL %j",
    async (avatarUrl) => {
      const physio = await newPhysio();
      await expect(
        db.update(physios).set({ avatarUrl }).where(eq(physios.id, physio.id)),
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
