import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { runAsPhysio } from "@/db/rls";
import { physios } from "@/db/schema";
import { env } from "@/env";
import { BRANDING_BUCKET } from "@/lib/branding";
import { brandTokens } from "@/lib/color";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";
import { adminClient, signInTestUser } from "@/test/int/supabase";

import { saveBranding, type LogoStorage } from "./mutations";
import { getBranding } from "./queries";
import type { BrandingInput, ValidLogo } from "./schemas";
import { supabaseLogoStorage } from "./storage";

// 1×1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const logo: ValidLogo = { bytes: new Uint8Array(PNG), type: "png" };

function clientFor(accessToken: string): SupabaseClient {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

const fields: BrandingInput = {
  clinicName: "Kine Sur",
  accentColor: "#0f766e",
  contactEmail: "hola@kine.com",
  contactPhone: "+5491112345678",
  website: "https://kine.com/",
  showContactToPatients: true,
  removeLogo: false,
};

describe("branding domain", () => {
  let maria: TestPhysio;
  let other: TestPhysio;
  let storage: LogoStorage;

  const save = (input: Partial<BrandingInput> & { logo?: ValidLogo | null } = {}, id?: string) =>
    runAsPhysio(maria.claims, (tx, physioId) =>
      saveBranding(tx, id ?? physioId, { ...fields, logo: null, ...input }, storage),
    );
  const listFolder = async (physioId: string) =>
    (await adminClient.storage.from(BRANDING_BUCKET).list(physioId)).data ?? [];
  const logoPath = async () =>
    (await db.select().from(physios).where(eq(physios.id, maria.id)))[0].logoPath;

  beforeAll(async () => {
    [maria, other] = await Promise.all([createTestPhysio(), createTestPhysio()]);
    storage = supabaseLogoStorage(clientFor(await signInTestUser(maria.email)));
  });

  afterAll(async () => {
    for (const physio of [maria, other]) {
      const files = await listFolder(physio.id);
      if (files.length) {
        await adminClient.storage
          .from(BRANDING_BUCKET)
          .remove(files.map((f) => `${physio.id}/${f.name}`));
      }
    }
    await deleteTestPhysios(maria, other);
  });

  it("saves fields and a logo, and getBranding serves them", async () => {
    const result = await save({ logo });
    expect(result.ok).toBe(true);
    const path = await logoPath();
    expect(path).toMatch(new RegExp(`^${maria.id}/logo-[0-9a-f-]{36}\\.png$`));

    const branding = await getBranding(db, maria.id);
    expect(branding).toMatchObject({
      clinicName: "Kine Sur",
      accentColor: "#0f766e",
      tokens: brandTokens("#0f766e"),
      contact: {
        email: "hola@kine.com",
        phone: "+5491112345678",
        whatsappUrl: "https://wa.me/5491112345678",
        website: "https://kine.com/",
      },
    });
    expect(branding?.logoUrl?.endsWith(path!)).toBe(true);
    expect(branding?.updatedAt).toBeInstanceOf(Date);
    expect((await fetch(branding!.logoUrl!)).status).toBe(200);
  });

  it("replaces the logo under a new path and reports the old one as stale", async () => {
    const first = await logoPath();
    const result = await save({ logo });
    const second = await logoPath();
    expect(second).not.toBe(first);
    expect(result).toMatchObject({ ok: true, data: { staleLogoPath: first } });

    await storage.remove([first!]);
    const files = await listFolder(maria.id);
    expect(files.map((f) => `${maria.id}/${f.name}`)).toEqual([second]);
  });

  it("removes the logo on request", async () => {
    const before = await logoPath();
    const result = await save({ removeLogo: true });
    expect(await logoPath()).toBeNull();
    expect(result).toMatchObject({ ok: true, data: { staleLogoPath: before } });
    expect((await getBranding(db, maria.id))?.logoUrl).toBeNull();
  });

  it("hides contact details from patients and stores blank fields as null", async () => {
    await save({ showContactToPatients: false });
    expect((await getBranding(db, maria.id))?.contact).toBeNull();

    await save({
      clinicName: null,
      accentColor: null,
      contactEmail: null,
      contactPhone: null,
      website: null,
    });
    const [row] = await db.select().from(physios).where(eq(physios.id, maria.id));
    expect(row).toMatchObject({
      clinicName: null,
      accentColor: null,
      contactEmail: null,
      contactPhone: null,
      website: null,
    });
    const branding = await getBranding(db, maria.id);
    expect(branding).toMatchObject({ accentColor: null, tokens: null });
    expect(branding?.clinicName).toBe(row.displayName);
  });

  it("cannot save another physio's branding, and uploads nothing for them", async () => {
    await expect(save({ logo }, other.id)).resolves.toEqual({ ok: false, error: "notFound" });
    expect(await listFolder(other.id)).toHaveLength(0);
  });

  it("returns null for an unknown physio", async () => {
    await expect(getBranding(db, crypto.randomUUID())).resolves.toBeNull();
  });
});
