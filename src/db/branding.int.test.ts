import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { physios } from "@/db/schema";
import { env } from "@/env";
import { BRANDING_BUCKET, logoPublicUrl } from "@/lib/branding";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";
import { adminClient, signInTestUser } from "@/test/int/supabase";

// 1×1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function clientFor(accessToken?: string): SupabaseClient {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  });
}

const logoPath = (physioId: string) => `${physioId}/logo-${crypto.randomUUID()}.png`;
const upload = (
  client: SupabaseClient,
  path: string,
  body: Buffer = PNG,
  contentType = "image/png",
) => client.storage.from(BRANDING_BUCKET).upload(path, body, { contentType });

describe("branding columns", () => {
  let maria: TestPhysio;
  let other: TestPhysio;

  beforeAll(async () => {
    [maria, other] = await Promise.all([createTestPhysio(), createTestPhysio()]);
  });
  afterAll(() => deleteTestPhysios(maria, other));

  const update = (values: Partial<typeof physios.$inferInsert>, id = maria.id) =>
    db.update(physios).set(values).where(eq(physios.id, id));

  it("defaults to no branding with contact shown", async () => {
    const [row] = await db.select().from(physios).where(eq(physios.id, maria.id));
    expect(row).toMatchObject({
      clinicName: null,
      logoPath: null,
      accentColor: null,
      contactEmail: null,
      contactPhone: null,
      website: null,
      showContactToPatients: true,
    });
  });

  it("accepts valid values", async () => {
    await expect(
      update({
        clinicName: "Kine Sur",
        accentColor: "#0f766e",
        logoPath: logoPath(maria.id),
        contactEmail: "hola@kine.com",
        contactPhone: "+5491112345678",
        website: "https://kine.com/",
      }),
    ).resolves.toBeDefined();
  });

  it.each([
    ["accent not lowercase hex", { accentColor: "#0F766E" }],
    ["accent named colour", { accentColor: "teal" }],
    ["clinic name too long", { clinicName: "x".repeat(81) }],
    ["empty clinic name", { clinicName: "" }],
    ["phone without +", { contactPhone: "5491112345678" }],
    ["http website", { website: "http://kine.com" }],
    [
      "logo in another physio's folder",
      { logoPath: "00000000-0000-0000-0000-000000000000/logo-x.png" },
    ],
    ["logo with svg extension", { logoPath: "SELF/logo-00000000-0000-0000-0000-000000000000.svg" }],
  ])("rejects %s", async (_name, values) => {
    const resolved = Object.fromEntries(
      Object.entries(values).map(([k, v]) => [
        k,
        typeof v === "string" ? v.replace("SELF", maria.id) : v,
      ]),
    );
    await expect(update(resolved)).rejects.toThrow();
  });
});

describe("branding bucket", () => {
  let maria: TestPhysio;
  let other: TestPhysio;
  let mariaClient: SupabaseClient;
  const anon = clientFor();

  beforeAll(async () => {
    [maria, other] = await Promise.all([createTestPhysio(), createTestPhysio()]);
    mariaClient = clientFor(await signInTestUser(maria.email));
  });

  afterAll(async () => {
    for (const physio of [maria, other]) {
      const { data } = await adminClient.storage.from(BRANDING_BUCKET).list(physio.id);
      if (data?.length) {
        await adminClient.storage
          .from(BRANDING_BUCKET)
          .remove(data.map((f) => `${physio.id}/${f.name}`));
      }
    }
    await deleteTestPhysios(maria, other);
  });

  it("lets a physio upload into their own folder, readable publicly without auth", async () => {
    const path = logoPath(maria.id);
    expect((await upload(mariaClient, path)).error).toBeNull();
    const response = await fetch(logoPublicUrl(env.NEXT_PUBLIC_SUPABASE_URL, path));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/png");
  });

  it("refuses uploads into another physio's folder", async () => {
    expect((await upload(mariaClient, logoPath(other.id))).error).not.toBeNull();
  });

  it("refuses anonymous uploads", async () => {
    expect((await upload(anon, logoPath(maria.id))).error).not.toBeNull();
  });

  it("refuses non-image types and files over 2 MB", async () => {
    const text = await upload(
      mariaClient,
      `${maria.id}/logo-${crypto.randomUUID()}.png`,
      Buffer.from("hi"),
      "text/plain",
    );
    expect(text.error).not.toBeNull();
    const big = await upload(mariaClient, logoPath(maria.id), Buffer.alloc(2 * 1024 * 1024 + 1));
    expect(big.error).not.toBeNull();
  });

  it("does not let a physio delete another physio's logo", async () => {
    const path = logoPath(other.id);
    expect((await upload(adminClient, path)).error).toBeNull();
    await mariaClient.storage.from(BRANDING_BUCKET).remove([path]);
    const { data } = await adminClient.storage.from(BRANDING_BUCKET).list(other.id);
    expect(data?.map((f) => `${other.id}/${f.name}`)).toContain(path);
  });

  it("lets a physio delete their own logo", async () => {
    const path = logoPath(maria.id);
    await upload(mariaClient, path);
    const { data, error } = await mariaClient.storage.from(BRANDING_BUCKET).remove([path]);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});
