import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { runAsPhysio } from "@/db/rls";
import { physios } from "@/db/schema";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";

import { completeOnboarding, setAvatarUrl, updateProfile } from "./mutations";
import { getProfile, isHandleAvailable, suggestHandle } from "./queries";
import type { ProfileInput } from "./schemas";

describe("physio profile", () => {
  let maria: TestPhysio;
  let other: TestPhysio;
  let otherHandle: string;

  const input = (overrides: Partial<ProfileInput> = {}): ProfileInput => ({
    displayName: "Maria Lopez",
    handle: `maria-${maria.id.slice(0, 8)}`,
    locale: "en",
    timezone: "Europe/Madrid",
    ...overrides,
  });

  beforeAll(async () => {
    [maria, other] = await Promise.all([
      createTestPhysio({ userMetadata: { full_name: "Maria Int" } }),
      createTestPhysio({ onboarded: true }),
    ]);
    const [row] = await db.select().from(physios).where(eq(physios.id, other.id));
    otherHandle = row.handle;
  });

  afterAll(() => deleteTestPhysios(maria, other));

  it("reads the physio's own profile", async () => {
    const profile = await runAsPhysio(maria.claims, (tx, id) => getProfile(tx, id));
    expect(profile).toMatchObject({ id: maria.id, displayName: "Maria Int", onboardedAt: null });
  });

  it("returns null for another physio's profile", async () => {
    expect(await runAsPhysio(maria.claims, (tx) => getProfile(tx, other.id))).toBeNull();
  });

  it("completes onboarding", async () => {
    const result = await runAsPhysio(maria.claims, (tx, id) => completeOnboarding(tx, id, input()));
    expect(result).toMatchObject({
      ok: true,
      data: { displayName: "Maria Lopez", timezone: "Europe/Madrid", handle: input().handle },
    });
    expect(result.ok && result.data.onboardedAt).toBeInstanceOf(Date);
  });

  it("updates the profile and keeps onboarded_at", async () => {
    const before = await runAsPhysio(maria.claims, (tx, id) => getProfile(tx, id));
    const result = await runAsPhysio(maria.claims, (tx, id) =>
      updateProfile(tx, id, input({ displayName: "María López" })),
    );
    expect(result).toMatchObject({ ok: true, data: { displayName: "María López" } });
    expect(result.ok && result.data.onboardedAt).toEqual(before?.onboardedAt);
  });

  it("reports a taken handle instead of throwing", async () => {
    const result = await runAsPhysio(maria.claims, (tx, id) =>
      updateProfile(tx, id, input({ handle: otherHandle })),
    );
    expect(result).toEqual({ ok: false, error: "handleTaken" });
  });

  it("keeps the transaction usable after a taken handle", async () => {
    const profile = await runAsPhysio(maria.claims, async (tx, id) => {
      await updateProfile(tx, id, input({ handle: otherHandle }));
      return getProfile(tx, id);
    });
    expect(profile?.id).toBe(maria.id);
  });

  it("cannot update another physio's profile", async () => {
    const result = await runAsPhysio(maria.claims, (tx) => updateProfile(tx, other.id, input()));
    expect(result).toEqual({ ok: false, error: "notFound" });
  });

  it("stores the sign-in photo on the physio's own row", async () => {
    const url = "https://lh3.googleusercontent.com/a/maria";
    await runAsPhysio(maria.claims, (tx, id) => setAvatarUrl(tx, id, url));
    const profile = await runAsPhysio(maria.claims, (tx, id) => getProfile(tx, id));
    expect(profile?.avatarUrl).toBe(url);
  });

  it("cannot set another physio's photo", async () => {
    await runAsPhysio(maria.claims, (tx) =>
      setAvatarUrl(tx, other.id, "https://lh3.googleusercontent.com/a/x"),
    );
    const [row] = await db.select().from(physios).where(eq(physios.id, other.id));
    expect(row.avatarUrl).toBeNull();
  });

  it("checks handle availability", async () => {
    const check = (handle: string) =>
      runAsPhysio(maria.claims, (tx) => isHandleAvailable(tx, handle));
    expect(await check(otherHandle)).toBe(false);
    expect(await check(`free-${crypto.randomUUID().slice(0, 8)}`)).toBe(true);
  });

  it("suggests the first free handle for a name", async () => {
    const base = `sugg-${maria.id.slice(0, 8)}`;
    const taker = await createTestPhysio({ handle: base });
    try {
      const suggestion = await runAsPhysio(maria.claims, (tx) => suggestHandle(tx, base));
      expect(suggestion).toBe(`${base}-2`);
    } finally {
      await deleteTestPhysios(taker);
    }
  });
});
