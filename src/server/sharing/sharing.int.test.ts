import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { runAsPhysio } from "@/db/rls";
import { customers, shareLinks } from "@/db/schema";
import { endOfDay } from "@/lib/calendar-date";
import { CODE_ALPHABET, isShareCode } from "@/lib/share-links";
import { insertCustomer, insertPlan, insertRoutine } from "@/test/int/content";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";

import { setCustomerArchived } from "@/server/customers/mutations";

import {
  ensureShareLink,
  getLatestLink,
  renewShareLink,
  revokeShareLink,
  setSharePin,
  updateShareLink,
} from "./mutations";
import { verifyPin } from "./pin-hash";

const RANDOM_ID = "0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10";

describe("share links (physio side)", () => {
  const created: TestPhysio[] = [];
  let a: TestPhysio;
  let b: TestPhysio;

  const fresh = async () => {
    const physio = await createTestPhysio({ onboarded: true });
    created.push(physio);
    return physio;
  };
  const as = <T>(who: TestPhysio, fn: Parameters<typeof runAsPhysio<T>>[1]) =>
    runAsPhysio(who.claims, fn);
  const customerRef = (customerId: string) => ({ target: "customer", customerId }) as const;
  const okData = <T>(result: { ok: true; data: T } | { ok: false; error: string }) => {
    if (!result.ok) throw new Error(result.error);
    return result.data;
  };

  beforeAll(async () => {
    a = await fresh();
    b = await fresh();
  });
  afterAll(() => deleteTestPhysios(...created));

  describe("ensureShareLink", () => {
    it("creates the customer link on first use with a code, a slug from the first name and no PIN", async () => {
      const customerId = await insertCustomer(a.id, { firstName: "María José" });
      const { link, context } = okData(
        await as(a, (tx, id) => ensureShareLink(tx, id, customerRef(customerId))),
      );
      expect(isShareCode(link.code)).toBe(true);
      expect([...link.code].every((ch) => CODE_ALPHABET.includes(ch))).toBe(true);
      expect(link).toMatchObject({
        physioId: a.id,
        customerId,
        target: "customer",
        routineId: null,
        weeklyPlanId: null,
        slug: "maria-jose",
        pinHash: null,
        expiresAt: null,
        revokedAt: null,
        openCount: 0,
      });
      expect(context.handle).toMatch(/^int-/);
    });

    it("returns the same live link the second time", async () => {
      const customerId = await insertCustomer(a.id);
      const first = okData(
        await as(a, (tx, id) => ensureShareLink(tx, id, customerRef(customerId))),
      );
      const second = okData(
        await as(a, (tx, id) => ensureShareLink(tx, id, customerRef(customerId))),
      );
      expect(second.link.id).toBe(first.link.id);
    });

    it("creates routine and plan links named after the item, once each", async () => {
      const customerId = await insertCustomer(a.id);
      const routineId = await insertRoutine(a.id, customerId, { name: "Rodilla — Fase 1" });
      const planId = await insertPlan(a.id, customerId, { name: "Weekly plan" });

      const routineLink = okData(
        await as(a, (tx, id) => ensureShareLink(tx, id, { target: "routine", routineId })),
      ).link;
      const planLink = okData(
        await as(a, (tx, id) =>
          ensureShareLink(tx, id, { target: "weekly_plan", weeklyPlanId: planId }),
        ),
      ).link;
      expect(routineLink).toMatchObject({
        target: "routine",
        routineId,
        customerId,
        slug: "rodilla-fase-1",
      });
      expect(planLink).toMatchObject({
        target: "weekly_plan",
        weeklyPlanId: planId,
        customerId,
        slug: "weekly-plan",
      });
      expect(routineLink.code).not.toBe(planLink.code);
    });

    it("returns the revoked link instead of creating a new one behind the physio's back", async () => {
      const customerId = await insertCustomer(a.id);
      const { link } = okData(
        await as(a, (tx, id) => ensureShareLink(tx, id, customerRef(customerId))),
      );
      await as(a, (tx, id) => revokeShareLink(tx, id, link.id));
      const again = okData(
        await as(a, (tx, id) => ensureShareLink(tx, id, customerRef(customerId))),
      );
      expect(again.link.id).toBe(link.id);
      expect(again.link.revokedAt).not.toBeNull();
    });

    it("is not found for another physio's customer, a template plan or a malformed id", async () => {
      const theirs = await insertCustomer(b.id);
      const template = await insertPlan(a.id, null, { name: "Template" });
      for (const ref of [
        customerRef(theirs),
        customerRef(RANDOM_ID),
        customerRef("nope"),
        { target: "weekly_plan", weeklyPlanId: template } as const,
        { target: "routine", routineId: RANDOM_ID } as const,
      ]) {
        expect(await as(a, (tx, id) => ensureShareLink(tx, id, ref))).toEqual({
          ok: false,
          error: "notFound",
        });
      }
    });

    it("does not create a link for an archived customer", async () => {
      const customerId = await insertCustomer(a.id, { archivedAt: new Date() });
      expect(await as(a, (tx, id) => ensureShareLink(tx, id, customerRef(customerId)))).toEqual({
        ok: false,
        error: "customerArchived",
      });
    });
  });

  describe("renewShareLink", () => {
    it("revokes the live link and creates a new code, keeping slug, PIN and expiry", async () => {
      const customerId = await insertCustomer(a.id);
      const { link } = okData(
        await as(a, (tx, id) => ensureShareLink(tx, id, customerRef(customerId))),
      );
      await as(a, (tx, id) =>
        updateShareLink(tx, id, { id: link.id, slug: "ana-lopez", expiresOn: "2099-01-31" }),
      );
      await as(a, (tx, id) => setSharePin(tx, id, link.id, true));
      const before = (await as(a, (tx, id) => getLatestLink(tx, id, customerRef(customerId))))!;

      const next = okData(
        await as(a, (tx, id) => renewShareLink(tx, id, customerRef(customerId))),
      ).link;
      expect(next.id).not.toBe(link.id);
      expect(next.code).not.toBe(link.code);
      expect(next).toMatchObject({ slug: "ana-lopez", revokedAt: null, openCount: 0 });
      expect(next.pinHash).toBe(before.pinHash);
      expect(next.expiresAt).toEqual(before.expiresAt);

      const [old] = await db.select().from(shareLinks).where(eq(shareLinks.id, link.id));
      expect(old!.revokedAt).not.toBeNull();
      // Only one live link per customer.
      const live = (
        await db.select().from(shareLinks).where(eq(shareLinks.customerId, customerId))
      ).filter((row) => row.revokedAt === null);
      expect(live).toHaveLength(1);
    });

    it("drops an expiry that has already passed instead of creating a dead link", async () => {
      const customerId = await insertCustomer(a.id);
      const { link } = okData(
        await as(a, (tx, id) => ensureShareLink(tx, id, customerRef(customerId))),
      );
      await db
        .update(shareLinks)
        .set({ expiresAt: new Date("2026-09-01T00:00:00Z") })
        .where(eq(shareLinks.id, link.id));
      const next = okData(
        await as(a, (tx, id) =>
          renewShareLink(tx, id, customerRef(customerId), new Date("2026-10-01T00:00:00Z")),
        ),
      ).link;
      expect(next.expiresAt).toBeNull();
    });

    it("creates a fresh link with defaults when the target never had one", async () => {
      const customerId = await insertCustomer(a.id, { firstName: "Luz" });
      const next = okData(
        await as(a, (tx, id) => renewShareLink(tx, id, customerRef(customerId))),
      ).link;
      expect(next.slug).toBe("luz");
    });

    it("creates a new link after a revoke", async () => {
      const customerId = await insertCustomer(a.id);
      const { link } = okData(
        await as(a, (tx, id) => ensureShareLink(tx, id, customerRef(customerId))),
      );
      await as(a, (tx, id) => revokeShareLink(tx, id, link.id));
      const next = okData(
        await as(a, (tx, id) => renewShareLink(tx, id, customerRef(customerId))),
      ).link;
      expect(next.revokedAt).toBeNull();
      expect(next.id).not.toBe(link.id);
    });

    it("refuses for an archived customer", async () => {
      const customerId = await insertCustomer(a.id);
      await as(a, (tx, id) => ensureShareLink(tx, id, customerRef(customerId)));
      await db
        .update(customers)
        .set({ archivedAt: new Date() })
        .where(eq(customers.id, customerId));
      expect(await as(a, (tx, id) => renewShareLink(tx, id, customerRef(customerId)))).toEqual({
        ok: false,
        error: "customerArchived",
      });
    });
  });

  describe("updateShareLink", () => {
    const NOW = new Date("2026-10-05T12:00:00Z");

    it("changes the slug and stores the expiry as the end of that day in the physio's time zone", async () => {
      const customerId = await insertCustomer(a.id);
      const { link } = okData(
        await as(a, (tx, id) => ensureShareLink(tx, id, customerRef(customerId))),
      );
      const updated = okData(
        await as(a, (tx, id) =>
          updateShareLink(tx, id, { id: link.id, slug: "knee", expiresOn: "2026-10-05" }, NOW),
        ),
      ).link;
      expect(updated.slug).toBe("knee");
      // The test physio's time zone is UTC (the column default).
      expect(updated.expiresAt).toEqual(endOfDay("UTC", "2026-10-05"));
    });

    it("clears the expiry with null and ignores fields that are not sent", async () => {
      const customerId = await insertCustomer(a.id);
      const { link } = okData(
        await as(a, (tx, id) => ensureShareLink(tx, id, customerRef(customerId))),
      );
      await as(a, (tx, id) => updateShareLink(tx, id, { id: link.id, expiresOn: "2099-01-01" }));
      const cleared = okData(
        await as(a, (tx, id) => updateShareLink(tx, id, { id: link.id, expiresOn: null })),
      ).link;
      expect(cleared.expiresAt).toBeNull();
      expect(cleared.slug).toBe(link.slug);
    });

    it("rejects an expiry before today", async () => {
      const customerId = await insertCustomer(a.id);
      const { link } = okData(
        await as(a, (tx, id) => ensureShareLink(tx, id, customerRef(customerId))),
      );
      expect(
        await as(a, (tx, id) =>
          updateShareLink(tx, id, { id: link.id, expiresOn: "2026-10-04" }, NOW),
        ),
      ).toEqual({ ok: false, error: "expiryInPast" });
    });

    it("cannot edit a revoked link or another physio's link", async () => {
      const customerId = await insertCustomer(a.id);
      const { link } = okData(
        await as(a, (tx, id) => ensureShareLink(tx, id, customerRef(customerId))),
      );
      expect(await as(b, (tx, id) => updateShareLink(tx, id, { id: link.id, slug: "x" }))).toEqual({
        ok: false,
        error: "notFound",
      });
      await as(a, (tx, id) => revokeShareLink(tx, id, link.id));
      expect(await as(a, (tx, id) => updateShareLink(tx, id, { id: link.id, slug: "x" }))).toEqual({
        ok: false,
        error: "notFound",
      });
    });
  });

  describe("setSharePin", () => {
    it("stores only a hash, returns the PIN once and replaces it each time", async () => {
      const customerId = await insertCustomer(a.id);
      const { link } = okData(
        await as(a, (tx, id) => ensureShareLink(tx, id, customerRef(customerId))),
      );

      const first = okData(await as(a, (tx, id) => setSharePin(tx, id, link.id, true)));
      expect(first.pin).toMatch(/^\d{4}$/);
      expect(first.link.pinHash).not.toContain(first.pin!);
      expect(await verifyPin(first.pin!, first.link.pinHash!)).toBe(true);

      let second = first;
      // A fresh PIN differs from the first one almost always; retry the 1-in-10000 collision.
      for (let i = 0; i < 5 && second.pin === first.pin; i++) {
        second = okData(await as(a, (tx, id) => setSharePin(tx, id, link.id, true)));
      }
      expect(await verifyPin(first.pin!, second.link.pinHash!)).toBe(false);
      expect(await verifyPin(second.pin!, second.link.pinHash!)).toBe(true);
    });

    it("turns the PIN off", async () => {
      const customerId = await insertCustomer(a.id);
      const { link } = okData(
        await as(a, (tx, id) => ensureShareLink(tx, id, customerRef(customerId))),
      );
      await as(a, (tx, id) => setSharePin(tx, id, link.id, true));
      const off = okData(await as(a, (tx, id) => setSharePin(tx, id, link.id, false)));
      expect(off.pin).toBeNull();
      expect(off.link.pinHash).toBeNull();
    });

    it("is not found for another physio's link", async () => {
      const customerId = await insertCustomer(a.id);
      const { link } = okData(
        await as(a, (tx, id) => ensureShareLink(tx, id, customerRef(customerId))),
      );
      expect(await as(b, (tx, id) => setSharePin(tx, id, link.id, true))).toEqual({
        ok: false,
        error: "notFound",
      });
    });
  });

  describe("revokeShareLink", () => {
    it("revokes once and stays revoked", async () => {
      const customerId = await insertCustomer(a.id);
      const { link } = okData(
        await as(a, (tx, id) => ensureShareLink(tx, id, customerRef(customerId))),
      );
      const first = okData(await as(a, (tx, id) => revokeShareLink(tx, id, link.id))).link;
      const second = okData(await as(a, (tx, id) => revokeShareLink(tx, id, link.id))).link;
      expect(first.revokedAt).not.toBeNull();
      expect(second.revokedAt).toEqual(first.revokedAt);
    });

    it("is not found for another physio's link or a malformed id", async () => {
      const customerId = await insertCustomer(a.id);
      const { link } = okData(
        await as(a, (tx, id) => ensureShareLink(tx, id, customerRef(customerId))),
      );
      expect(await as(b, (tx, id) => revokeShareLink(tx, id, link.id))).toEqual({
        ok: false,
        error: "notFound",
      });
      expect(await as(a, (tx, id) => revokeShareLink(tx, id, "nope"))).toEqual({
        ok: false,
        error: "notFound",
      });
    });
  });

  describe("archiving a customer", () => {
    it("revokes all of their links (customer, routine and plan) and restoring does not bring them back", async () => {
      const customerId = await insertCustomer(a.id);
      const routineId = await insertRoutine(a.id, customerId);
      const planId = await insertPlan(a.id, customerId);
      const other = await insertCustomer(a.id);
      const targets = [
        customerRef(customerId),
        { target: "routine", routineId } as const,
        { target: "weekly_plan", weeklyPlanId: planId } as const,
        customerRef(other),
      ];
      for (const ref of targets) okData(await as(a, (tx, id) => ensureShareLink(tx, id, ref)));

      okData(await as(a, (tx, id) => setCustomerArchived(tx, id, customerId, true)));
      const rows = await db.select().from(shareLinks);
      const mine = rows.filter((row) => row.customerId === customerId);
      expect(mine).toHaveLength(3);
      expect(mine.every((row) => row.revokedAt !== null)).toBe(true);
      expect(rows.find((row) => row.customerId === other)!.revokedAt).toBeNull();

      okData(await as(a, (tx, id) => setCustomerArchived(tx, id, customerId, false)));
      const after = (await db.select().from(shareLinks)).filter(
        (row) => row.customerId === customerId,
      );
      expect(after.every((row) => row.revokedAt !== null)).toBe(true);
    });
  });

  describe("database rules", () => {
    it("hides other physios' links under RLS", async () => {
      const customerId = await insertCustomer(a.id);
      const { link } = okData(
        await as(a, (tx, id) => ensureShareLink(tx, id, customerRef(customerId))),
      );
      const seen = await as(b, (tx) =>
        tx.select().from(shareLinks).where(eq(shareLinks.id, link.id)),
      );
      expect(seen).toEqual([]);
      const touched = await as(b, (tx) =>
        tx
          .update(shareLinks)
          .set({ revokedAt: new Date() })
          .where(eq(shareLinks.id, link.id))
          .returning(),
      );
      expect(touched).toEqual([]);
    });

    it("cannot point a link at another physio's customer", async () => {
      const theirs = await insertCustomer(b.id);
      await expect(
        as(a, (tx, id) =>
          tx.insert(shareLinks).values({
            physioId: id,
            customerId: theirs,
            target: "customer",
            slug: "x",
            code: "abcdefgh",
          }),
        ),
      ).rejects.toThrow();
    });

    it("rejects malformed codes, slugs and target/id combinations", async () => {
      const customerId = await insertCustomer(a.id);
      const base = { physioId: a.id, customerId, target: "customer", slug: "ana" } as const;
      await expect(db.insert(shareLinks).values({ ...base, code: "abcdefgi" })).rejects.toThrow(); // "i"
      await expect(db.insert(shareLinks).values({ ...base, code: "ABCDEFGH" })).rejects.toThrow();
      await expect(db.insert(shareLinks).values({ ...base, code: "abcdefg" })).rejects.toThrow();
      await expect(
        db.insert(shareLinks).values({ ...base, code: "abcdefgh", slug: "Ana Lopez" }),
      ).rejects.toThrow();
      await expect(
        db.insert(shareLinks).values({ ...base, code: "abcdefgh", slug: "a".repeat(41) }),
      ).rejects.toThrow();
      await expect(
        db.insert(shareLinks).values({ ...base, code: "abcdefgh", slug: "" }),
      ).rejects.toThrow();
      await expect(
        db.insert(shareLinks).values({ ...base, code: "abcdefgh", target: "routine" }),
      ).rejects.toThrow(); // routine target without routine_id
    });

    it("keeps codes unique across physios", async () => {
      const customerA = await insertCustomer(a.id);
      const customerB = await insertCustomer(b.id);
      await db.insert(shareLinks).values({
        physioId: a.id,
        customerId: customerA,
        target: "customer",
        slug: "a",
        code: "d9pe2345",
      });
      await expect(
        db.insert(shareLinks).values({
          physioId: b.id,
          customerId: customerB,
          target: "customer",
          slug: "b",
          code: "d9pe2345",
        }),
      ).rejects.toThrow();
    });

    it("allows only one live link per customer", async () => {
      const customerId = await insertCustomer(a.id);
      await db
        .insert(shareLinks)
        .values({ physioId: a.id, customerId, target: "customer", slug: "a", code: "q7ve2345" });
      await expect(
        db
          .insert(shareLinks)
          .values({ physioId: a.id, customerId, target: "customer", slug: "a", code: "q7ve3456" }),
      ).rejects.toThrow();
    });

    it("deletes links with the customer, routine or plan they point at", async () => {
      const customerId = await insertCustomer(a.id);
      const routineId = await insertRoutine(a.id, customerId);
      okData(await as(a, (tx, id) => ensureShareLink(tx, id, { target: "routine", routineId })));
      await db.delete(customers).where(eq(customers.id, customerId));
      expect(
        await db.select().from(shareLinks).where(eq(shareLinks.customerId, customerId)),
      ).toEqual([]);
    });
  });
});
