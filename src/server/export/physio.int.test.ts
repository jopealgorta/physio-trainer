import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { runAsPhysio } from "@/db/rls";
import { routines, shareLinks } from "@/db/schema";
import { getSessionPhysio } from "@/server/auth/session";
import { revokeShareLink } from "@/server/sharing/mutations";
import { insertCustomer, insertExercise, insertPlan, insertRoutine } from "@/test/int/content";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";

import { exportForPhysio } from "./physio";

vi.mock("@/server/auth/session", () => ({ getSessionPhysio: vi.fn() }));

describe("exportForPhysio", () => {
  const created: TestPhysio[] = [];
  let physio: TestPhysio;
  let other: TestPhysio;

  const signIn = (who: TestPhysio | null) =>
    vi
      .mocked(getSessionPhysio)
      .mockResolvedValue(who ? { physioId: who.id, claims: who.claims } : null);
  const call = (kind: "routine" | "plan" | "customer", id: string, qs: string) =>
    exportForPhysio(kind, id, new URL(`https://x.test/api/export/${kind}/${id}${qs}`));
  const bytes = async (res: Response) => Buffer.from(await res.arrayBuffer());

  beforeAll(async () => {
    physio = await createTestPhysio({ onboarded: true });
    other = await createTestPhysio({ onboarded: true });
    created.push(physio, other);
  });
  afterAll(() => deleteTestPhysios(...created));
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 404 }));
    signIn(physio);
  });
  // The cleanup in afterAll deletes auth users over global fetch: it must not hit the stub.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is 401 without a session", async () => {
    signIn(null);
    const res = await call("routine", "x", "?format=pdf");
    expect(res.status).toBe(401);
  });

  it("is 400 for a bad query", async () => {
    const res = await call("routine", "x", "?format=doc");
    expect(res.status).toBe(400);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });

  it("exports an owned routine as PDF", async () => {
    const customerId = await insertCustomer(physio.id, { firstName: "Ana" });
    const ex = await insertExercise(physio.id, { name: "Bridge" });
    const routineId = await insertRoutine(physio.id, customerId, {
      name: "Knee rehab",
      status: "active",
      items: [{ exerciseId: ex, reps: 10 }],
    });
    const res = await call("routine", routineId, "?format=pdf");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("knee-rehab");
    expect((await bytes(res)).subarray(0, 4).toString()).toBe("%PDF");
  });

  it("exports an owned plan as xlsx", async () => {
    const customerId = await insertCustomer(physio.id);
    const routineId = await insertRoutine(physio.id, customerId, { status: "active" });
    const planId = await insertPlan(physio.id, customerId, {
      name: "Week one",
      status: "active",
      entries: [{ weekday: 1, routineId }],
    });
    const res = await call("plan", planId, "?format=xlsx&tracking=0");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("spreadsheetml");
    expect((await bytes(res)).subarray(0, 2).toString()).toBe("PK");
  });

  it("exports a customer with nothing active", async () => {
    const customerId = await insertCustomer(physio.id);
    const res = await call("customer", customerId, "?format=pdf");
    expect(res.status).toBe(200);
  });

  it("is 404 for another physio's routine, a template and a bad id", async () => {
    const customerId = await insertCustomer(physio.id);
    const routineId = await insertRoutine(physio.id, customerId, { status: "active" });
    const [template] = await db
      .insert(routines)
      .values({
        physioId: physio.id,
        customerId: null,
        isTemplate: true,
        name: "T",
        status: "active",
      })
      .returning({ id: routines.id });
    signIn(other);
    expect((await call("routine", routineId, "?format=pdf")).status).toBe(404);
    signIn(physio);
    expect((await call("routine", template!.id, "?format=pdf")).status).toBe(404);
    expect((await call("routine", "nope", "?format=pdf")).status).toBe(404);
  });

  describe("customer share link", () => {
    const linkCount = async (customerId: string) =>
      (await db.select().from(shareLinks).where(eq(shareLinks.customerId, customerId))).length;

    it("is created by the first export and not recreated once revoked", async () => {
      const customerId = await insertCustomer(physio.id);
      expect(await linkCount(customerId)).toBe(0);
      expect((await call("customer", customerId, "?format=pdf")).status).toBe(200);
      expect(await linkCount(customerId)).toBe(1);

      const [link] = await db
        .select()
        .from(shareLinks)
        .where(eq(shareLinks.customerId, customerId));
      await runAsPhysio(physio.claims, (tx, id) => revokeShareLink(tx, id, link!.id));
      expect((await call("customer", customerId, "?format=pdf")).status).toBe(200);
      expect(await linkCount(customerId)).toBe(1);
    });

    it("is not created by an Excel export", async () => {
      const customerId = await insertCustomer(physio.id);
      expect((await call("customer", customerId, "?format=xlsx")).status).toBe(200);
      expect(await linkCount(customerId)).toBe(0);
    });
  });
});
