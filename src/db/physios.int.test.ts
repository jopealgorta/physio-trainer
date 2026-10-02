import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { physios } from "@/db/schema";
import { AVATAR_URL_PATTERN, isAvatarUrl } from "@/lib/avatar";
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

const GOOGLE_PHOTO = "https://lh3.googleusercontent.com/a/photo=s96-c";
/** URLs the app rejects (`isAvatarUrl`); the trigger and the check must reject them too. */
const BAD_PHOTOS: [string, string][] = [
  ["http", "http://lh3.googleusercontent.com/a/x"],
  ["javascript", "javascript:alert(1)"],
  ["another host", "https://example.test/photo.png"],
  ["bare Google domain", "https://googleusercontent.com/a/x"],
  ["look-alike suffix", "https://lh3.googleusercontent.com.evil.test/a/x"],
  ["look-alike prefix", "https://evilgoogleusercontent.com/a/x"],
  ["host behind user info", "https://lh3.googleusercontent.com@evil.test/a/x"],
  ["user info", "https://user:pass@lh3.googleusercontent.com/a/x"],
  ["port", "https://lh3.googleusercontent.com:8443/a/x"],
  ["upper-case host", "https://LH3.googleusercontent.com/a/x"],
  ["bad label", "https://-lh3.googleusercontent.com/a/x"],
  ["empty label", "https://lh3..googleusercontent.com/a/x"],
  ["space in path", "https://lh3.googleusercontent.com/a b"],
  ["too long", `https://lh3.googleusercontent.com/${"x".repeat(2048)}`],
];

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
    const physio = await newPhysio({
      userMetadata: { avatar_url: GOOGLE_PHOTO, picture: "https://lh4.googleusercontent.com/p" },
    });
    expect((await rowOf(physio.id)).avatarUrl).toBe(GOOGLE_PHOTO);
  });

  it("skips an unusable avatar_url for a usable picture, like the app", async () => {
    const physio = await newPhysio({
      userMetadata: { avatar_url: "https://example.test/a.png", picture: GOOGLE_PHOTO },
    });
    expect((await rowOf(physio.id)).avatarUrl).toBe(GOOGLE_PHOTO);
  });

  it("falls back to 'picture' when avatar_url is missing", async () => {
    const url = "https://lh3.googleusercontent.com/a/picture";
    const physio = await newPhysio({ userMetadata: { picture: url } });
    expect((await rowOf(physio.id)).avatarUrl).toBe(url);
  });

  it.each([...BAD_PHOTOS, ["not a string", 42] as [string, number]])(
    "ignores a photo URL with %s",
    async (label, avatarUrl) => {
      if (typeof avatarUrl === "string") expect(isAvatarUrl(avatarUrl), label).toBe(false);
      const physio = await newPhysio({ userMetadata: { avatar_url: avatarUrl } });
      expect((await rowOf(physio.id)).avatarUrl).toBeNull();
    },
  );

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

  it("validates photos with the app's pattern, in the check and the sign-up trigger", async () => {
    const [row] = await db.execute<{ trigger: string; check: string }>(sql`
      select pg_get_functiondef('public.handle_new_user'::regproc) as trigger,
        (select pg_get_constraintdef(oid) from pg_constraint
          where conname = 'physios_avatar_url_format') as check`);
    expect(row.trigger).toContain(`'${AVATAR_URL_PATTERN}'`);
    expect(row.check).toContain(`'${AVATAR_URL_PATTERN}'`);
  });

  it("accepts a Google photo URL", async () => {
    const physio = await newPhysio();
    await db.update(physios).set({ avatarUrl: GOOGLE_PHOTO }).where(eq(physios.id, physio.id));
    expect((await rowOf(physio.id)).avatarUrl).toBe(GOOGLE_PHOTO);
  });

  it.each(BAD_PHOTOS)("rejects an avatar URL with %s", async (_label, avatarUrl) => {
    const physio = await newPhysio();
    await expect(
      db.update(physios).set({ avatarUrl }).where(eq(physios.id, physio.id)),
    ).rejects.toThrow();
  });

  it("rejects an empty display name", async () => {
    const physio = await newPhysio();
    await expect(
      db.update(physios).set({ displayName: "" }).where(eq(physios.id, physio.id)),
    ).rejects.toThrow();
  });
});
