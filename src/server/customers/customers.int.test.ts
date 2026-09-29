import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { runAsPhysio } from "@/db/rls";
import { cases, customers, physios } from "@/db/schema";
import { DEFAULT_CUSTOMER_FILTERS, type CustomerFilters } from "@/lib/customer-params";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";

import {
  closeCase,
  createCase,
  createCustomer,
  reopenCase,
  setCustomerArchived,
  updateCase,
  updateCustomer,
} from "./mutations";
import { getCustomer, hasAnyCustomers, listCustomers } from "./queries";
import { caseSchema, customerSchema, type CaseInput, type CustomerInput } from "./schemas";

const RANDOM_ID = "0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10";

const customerInput = (overrides: Record<string, unknown> = {}): CustomerInput =>
  customerSchema.parse({ firstName: "Ana", ...overrides });
const caseInput = (overrides: Record<string, unknown> = {}): CaseInput =>
  caseSchema.parse({ title: "Knee rehab", ...overrides });
const filters = (overrides: Partial<CustomerFilters> = {}): CustomerFilters => ({
  ...DEFAULT_CUSTOMER_FILTERS,
  ...overrides,
});
const fullName = (row: { firstName: string; lastName: string | null }) =>
  [row.firstName, row.lastName].filter(Boolean).join(" ");

describe("customers server layer", () => {
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
  const customer = async (who: TestPhysio, overrides: Record<string, unknown> = {}) => {
    const result = await as(who, (tx, id) => createCustomer(tx, id, customerInput(overrides)));
    if (!result.ok) throw new Error("createCustomer failed");
    return result.data.id;
  };
  const kase = async (
    who: TestPhysio,
    customerId: string,
    overrides: Record<string, unknown> = {},
    today = "2026-03-10",
  ) => {
    const result = await as(who, (tx, id) =>
      createCase(tx, id, customerId, caseInput(overrides), today),
    );
    if (!result.ok) throw new Error(result.error);
    return result.data.id;
  };
  const storedCase = async (id: string) =>
    (await db.select().from(cases).where(eq(cases.id, id)))[0];
  const storedCustomer = async (id: string) =>
    (await db.select().from(customers).where(eq(customers.id, id)))[0];

  beforeAll(async () => {
    [a, b] = await Promise.all([fresh(), fresh()]);
  });
  afterAll(() => deleteTestPhysios(...created));

  describe("createCustomer", () => {
    it("stores the physio's locale when none is given, and an explicit locale otherwise", async () => {
      await db.update(physios).set({ locale: "es" }).where(eq(physios.id, a.id));
      const inherited = await customer(a, { firstName: "Inherits" });
      const explicit = await customer(a, { firstName: "Explicit", locale: "en" });
      expect((await storedCustomer(inherited)).locale).toBe("es");
      expect((await storedCustomer(explicit)).locale).toBe("en");
    });

    it("stores every field for the owning physio", async () => {
      const id = await customer(a, {
        firstName: "Full",
        lastName: "Record",
        email: "Full@Example.com",
        phone: "+598 99 123 456",
        dateOfBirth: "1990-05-17",
        sex: "female",
        occupation: "Nurse",
        activity: "Running",
        medicalHistory: "None",
      });
      expect(await storedCustomer(id)).toMatchObject({
        physioId: a.id,
        firstName: "Full",
        lastName: "Record",
        email: "full@example.com",
        phone: "+598 99 123 456",
        dateOfBirth: "1990-05-17",
        sex: "female",
        occupation: "Nurse",
        activity: "Running",
        medicalHistory: "None",
        archivedAt: null,
      });
    });
  });

  describe("listCustomers", () => {
    let p: TestPhysio;
    let angel: string;
    let ana: string;
    let beto: string;
    let jose: string;
    let percent: string;
    let axb: string;
    let underscore: string;

    beforeAll(async () => {
      p = await fresh();
      const seed = async (firstName: string, lastName: string | null, createdAt: string) => {
        const [row] = await db
          .insert(customers)
          .values({
            physioId: p.id,
            firstName,
            lastName,
            locale: "en",
            createdAt: new Date(createdAt),
          })
          .returning({ id: customers.id });
        return row.id;
      };
      angel = await seed("ángel", null, "2026-01-01T10:00:00Z");
      ana = await seed("Ana", "Zeta", "2026-01-02T10:00:00Z");
      beto = await seed("beto", "Alfa", "2026-01-03T10:00:00Z");
      jose = await seed("José", "García", "2026-01-04T10:00:00Z");
      percent = await seed("50% Off", null, "2026-01-05T10:00:00Z");
      axb = await seed("aXb", null, "2026-01-06T10:00:00Z");
      underscore = await seed("a_b", null, "2026-01-07T10:00:00Z");
      await db.insert(customers).values({
        physioId: p.id,
        firstName: "Archivada",
        locale: "en",
        archivedAt: new Date("2026-02-01T10:00:00Z"),
      });
    });

    const list = async (overrides: Partial<CustomerFilters> = {}, limit?: number) =>
      as(p, (tx, id) => listCustomers(tx, id, filters(overrides), limit));
    const listed = async (overrides: Partial<CustomerFilters> = {}) =>
      (await list(overrides)).customers.map(fullName);

    it("sorts by name ignoring case and accents, and hides archived by default", async () => {
      expect(await listed()).toEqual([
        "50% Off",
        "a_b",
        "Ana Zeta",
        "ángel",
        "aXb",
        "beto Alfa",
        "José García",
      ]);
    });

    it("sorts by recency, newest first", async () => {
      expect((await list({ sort: "recent" })).customers.map((row) => row.id)).toEqual([
        underscore,
        axb,
        percent,
        jose,
        beto,
        ana,
        angel,
      ]);
    });

    it("shows only archived customers when asked", async () => {
      expect(await listed({ archived: true })).toEqual(["Archivada"]);
    });

    it("only returns the physio's own customers", async () => {
      const result = await as(b, (tx, id) => listCustomers(tx, id, filters()));
      expect(result.customers.map((row) => row.id)).not.toContain(ana);
      expect(result.customers.map((row) => row.id)).not.toContain(jose);
      // Even with RLS bypassed, the explicit physio filter keeps the lists apart.
      const other = await as(b, (tx) => listCustomers(tx, p.id, filters()));
      expect(other.customers).toEqual([]);
    });

    it("searches accent- and case-insensitively across the full name", async () => {
      for (const q of ["jose", "garcia", "GARC", "jose garcia", "José", "josé garcía", "e g"]) {
        expect(await listed({ q }), q).toEqual(["José García"]);
      }
      expect(await listed({ q: "zzz" })).toEqual([]);
    });

    it("matches LIKE wildcards literally", async () => {
      expect(await listed({ q: "50%" })).toEqual(["50% Off"]);
      expect(await listed({ q: "a_b" })).toEqual(["a_b"]);
      expect(await listed({ q: "\\" })).toEqual([]);
    });

    it("treats an empty search as no filter", async () => {
      expect((await listed({ q: "" })).length).toBe(7);
    });

    it("searches archived customers only when the archive is shown", async () => {
      expect(await listed({ q: "archivada" })).toEqual([]);
      expect(await listed({ q: "archivada", archived: true })).toEqual(["Archivada"]);
    });

    it("reports truncation when more than the limit exist", async () => {
      const page = await list({}, 2);
      expect(page.customers).toHaveLength(2);
      expect(page.truncated).toBe(true);
      const all = await list({}, 7);
      expect(all.customers).toHaveLength(7);
      expect(all.truncated).toBe(false);
    });

    it("returns the most recent open case as the active case", async () => {
      await db.insert(cases).values([
        { physioId: p.id, customerId: ana, title: "Older open", openedOn: "2026-01-10" },
        {
          physioId: p.id,
          customerId: ana,
          title: "Newer open",
          bodyArea: "knee",
          side: "left",
          openedOn: "2026-02-10",
        },
        {
          physioId: p.id,
          customerId: ana,
          title: "Closed",
          status: "closed",
          openedOn: "2026-03-01",
          closedOn: "2026-03-05",
        },
        {
          physioId: p.id,
          customerId: beto,
          title: "Only closed",
          status: "closed",
          openedOn: "2026-01-01",
          closedOn: "2026-01-02",
        },
      ]);
      const rows = (await list()).customers;
      expect(rows.find((row) => row.id === ana)?.activeCase).toEqual({
        title: "Newer open",
        bodyArea: "knee",
        side: "left",
      });
      expect(rows.find((row) => row.id === beto)?.activeCase).toBeNull();
      expect(rows.find((row) => row.id === jose)?.activeCase).toBeNull();
    });
  });

  describe("hasAnyCustomers", () => {
    it("is false when empty, true with only archived customers, and per physio", async () => {
      const c = await fresh();
      const d = await fresh();
      expect(await as(c, (tx, id) => hasAnyCustomers(tx, id))).toBe(false);
      const id = await customer(c, { firstName: "Solo" });
      await as(c, (tx, physioId) => setCustomerArchived(tx, physioId, id, true));
      expect(await as(c, (tx, physioId) => hasAnyCustomers(tx, physioId))).toBe(true);
      expect(await as(d, (tx, physioId) => hasAnyCustomers(tx, physioId))).toBe(false);
    });
  });

  describe("getCustomer", () => {
    it("returns the customer with open cases first, then closed", async () => {
      const id = await customer(a, { firstName: "Detail" });
      const closedOld = await kase(a, id, { title: "Closed old", openedOn: "2026-01-01" });
      const closedNew = await kase(a, id, { title: "Closed new", openedOn: "2026-01-02" });
      const openOld = await kase(a, id, { title: "Open old", openedOn: "2026-02-01" });
      const openNew = await kase(a, id, { title: "Open new", openedOn: "2026-03-01" });
      await as(a, (tx, physioId) => closeCase(tx, physioId, closedOld, "2026-01-05"));
      await as(a, (tx, physioId) => closeCase(tx, physioId, closedNew, "2026-01-20"));

      const detail = await as(a, (tx, physioId) => getCustomer(tx, physioId, id));
      expect(detail?.firstName).toBe("Detail");
      expect(detail?.cases.map((row) => row.id)).toEqual([openNew, openOld, closedNew, closedOld]);
    });

    it("returns null for another physio's customer and for a random id", async () => {
      const id = await customer(a, { firstName: "Private" });
      expect(await as(b, (tx, physioId) => getCustomer(tx, physioId, id))).toBeNull();
      expect(await as(a, (tx, physioId) => getCustomer(tx, physioId, RANDOM_ID))).toBeNull();
      // explicit physio filter, even when the caller passes another physio's id
      expect(await as(b, (tx) => getCustomer(tx, a.id, id))).toBeNull();
    });
  });

  describe("updateCustomer and setCustomerArchived", () => {
    it("updates the customer's fields", async () => {
      const id = await customer(a, { firstName: "Before" });
      const result = await as(a, (tx, physioId) =>
        updateCustomer(tx, physioId, id, customerInput({ firstName: "After", locale: "es" })),
      );
      expect(result).toEqual({ ok: true, data: null });
      expect(await storedCustomer(id)).toMatchObject({ firstName: "After", locale: "es" });
    });

    it("keeps the current locale when the input has none", async () => {
      const id = await customer(a, { firstName: "Keeps", locale: "es" });
      await as(a, (tx, physioId) =>
        updateCustomer(tx, physioId, id, customerInput({ firstName: "Keeps", locale: "" })),
      );
      expect((await storedCustomer(id)).locale).toBe("es");
    });

    it("reports notFound for another physio's or a random customer, leaving the row alone", async () => {
      const id = await customer(a, { firstName: "Mine" });
      expect(
        await as(b, (tx, physioId) =>
          updateCustomer(tx, physioId, id, customerInput({ firstName: "Hijacked" })),
        ),
      ).toEqual({ ok: false, error: "notFound" });
      expect(await as(b, (tx, physioId) => setCustomerArchived(tx, physioId, id, true))).toEqual({
        ok: false,
        error: "notFound",
      });
      expect(
        await as(a, (tx, physioId) => setCustomerArchived(tx, physioId, RANDOM_ID, true)),
      ).toEqual({ ok: false, error: "notFound" });
      expect(await storedCustomer(id)).toMatchObject({ firstName: "Mine", archivedAt: null });
    });

    it("archives and restores without touching anything else", async () => {
      const id = await customer(a, { firstName: "Cycle" });
      const openCase = await kase(a, id);
      expect(await as(a, (tx, physioId) => setCustomerArchived(tx, physioId, id, true))).toEqual({
        ok: true,
        data: null,
      });
      const archived = await storedCustomer(id);
      expect(archived.archivedAt).toBeInstanceOf(Date);

      expect(await as(a, (tx, physioId) => setCustomerArchived(tx, physioId, id, false))).toEqual({
        ok: true,
        data: null,
      });
      const restored = await storedCustomer(id);
      expect(restored.archivedAt).toBeNull();
      expect({ ...restored, archivedAt: null, updatedAt: null }).toEqual({
        ...archived,
        archivedAt: null,
        updatedAt: null,
      });
      expect((await storedCase(openCase)).status).toBe("open");
    });
  });

  describe("createCase", () => {
    it("defaults the opening date to the given day", async () => {
      const id = await customer(a, { firstName: "Cases" });
      const withDefault = await kase(a, id, { openedOn: "" }, "2026-04-02");
      const explicit = await kase(a, id, { openedOn: "2026-01-15" }, "2026-04-02");
      expect(await storedCase(withDefault)).toMatchObject({
        physioId: a.id,
        customerId: id,
        status: "open",
        openedOn: "2026-04-02",
        closedOn: null,
      });
      expect((await storedCase(explicit)).openedOn).toBe("2026-01-15");
    });

    it("stores the clinical fields", async () => {
      const id = await customer(a, { firstName: "Clinical" });
      const caseId = await kase(a, id, {
        diagnosis: "ACL sprain",
        bodyArea: "knee",
        side: "left",
        injuryOn: "2026-01-01",
        surgeryOn: "2026-01-20",
        precautions: "No pivoting",
        goals: "Run again",
        initialPain: "6",
        notes: "Note",
      });
      expect(await storedCase(caseId)).toMatchObject({
        title: "Knee rehab",
        diagnosis: "ACL sprain",
        bodyArea: "knee",
        side: "left",
        injuryOn: "2026-01-01",
        surgeryOn: "2026-01-20",
        precautions: "No pivoting",
        goals: "Run again",
        initialPain: 6,
        notes: "Note",
      });
    });

    it("reports customerNotFound for another physio's or a random customer", async () => {
      const id = await customer(a, { firstName: "Not yours" });
      expect(
        await as(b, (tx, physioId) => createCase(tx, physioId, id, caseInput(), "2026-03-10")),
      ).toEqual({ ok: false, error: "customerNotFound" });
      expect(
        await as(a, (tx, physioId) =>
          createCase(tx, physioId, RANDOM_ID, caseInput(), "2026-03-10"),
        ),
      ).toEqual({ ok: false, error: "customerNotFound" });
      expect(await db.select().from(cases).where(eq(cases.customerId, id))).toEqual([]);
    });
  });

  describe("updateCase", () => {
    it("updates content fields but never status or closing date", async () => {
      const id = await customer(a, { firstName: "Update" });
      const caseId = await kase(a, id, { openedOn: "2026-01-01" });
      await as(a, (tx, physioId) => closeCase(tx, physioId, caseId, "2026-02-01"));
      const result = await as(a, (tx, physioId) =>
        updateCase(
          tx,
          physioId,
          caseId,
          caseInput({ title: "Renamed", bodyArea: "hip_groin", openedOn: "2026-01-05" }),
        ),
      );
      expect(result).toEqual({ ok: true, data: null });
      expect(await storedCase(caseId)).toMatchObject({
        title: "Renamed",
        bodyArea: "hip_groin",
        openedOn: "2026-01-05",
        status: "closed",
        closedOn: "2026-02-01",
      });
    });

    it("keeps the opening date when the input has none", async () => {
      const id = await customer(a, { firstName: "Keeps date" });
      const caseId = await kase(a, id, { openedOn: "2026-01-01" });
      await as(a, (tx, physioId) =>
        updateCase(tx, physioId, caseId, caseInput({ title: "Same day", openedOn: "" })),
      );
      expect(await storedCase(caseId)).toMatchObject({ title: "Same day", openedOn: "2026-01-01" });
    });

    it("reports notFound for another physio's case", async () => {
      const id = await customer(a, { firstName: "Other case" });
      const caseId = await kase(a, id);
      expect(
        await as(b, (tx, physioId) =>
          updateCase(tx, physioId, caseId, caseInput({ title: "Hijacked" })),
        ),
      ).toEqual({ ok: false, error: "notFound" });
      expect((await storedCase(caseId)).title).toBe("Knee rehab");
      expect(
        await as(a, (tx, physioId) => updateCase(tx, physioId, RANDOM_ID, caseInput())),
      ).toEqual({ ok: false, error: "notFound" });
    });

    it("refuses an opening date after the closing date", async () => {
      const id = await customer(a, { firstName: "Late open" });
      const caseId = await kase(a, id, { openedOn: "2026-01-01" });
      await as(a, (tx, physioId) => closeCase(tx, physioId, caseId, "2026-01-10"));
      expect(
        await as(a, (tx, physioId) =>
          updateCase(tx, physioId, caseId, caseInput({ title: "Changed", openedOn: "2026-02-01" })),
        ),
      ).toEqual({ ok: false, error: "openedAfterClosed" });
      expect(await storedCase(caseId)).toMatchObject({
        title: "Knee rehab",
        openedOn: "2026-01-01",
      });
    });
  });

  describe("closeCase and reopenCase", () => {
    it("closes an open case and reopens it", async () => {
      const id = await customer(a, { firstName: "Lifecycle" });
      const caseId = await kase(a, id, { openedOn: "2026-01-01" });
      expect(await as(a, (tx, physioId) => closeCase(tx, physioId, caseId, "2026-01-01"))).toEqual({
        ok: true,
        data: null,
      });
      expect(await storedCase(caseId)).toMatchObject({ status: "closed", closedOn: "2026-01-01" });
      expect(await as(a, (tx, physioId) => reopenCase(tx, physioId, caseId))).toEqual({
        ok: true,
        data: null,
      });
      expect(await storedCase(caseId)).toMatchObject({ status: "open", closedOn: null });
    });

    it("refuses a closing date before the opening date and changes nothing", async () => {
      const id = await customer(a, { firstName: "Too early" });
      const caseId = await kase(a, id, { openedOn: "2026-02-01" });
      expect(await as(a, (tx, physioId) => closeCase(tx, physioId, caseId, "2026-01-31"))).toEqual({
        ok: false,
        error: "closedBeforeOpened",
      });
      expect(await storedCase(caseId)).toMatchObject({ status: "open", closedOn: null });
    });

    it("reports notOpen for a closed case, notClosed for an open one", async () => {
      const id = await customer(a, { firstName: "Wrong state" });
      const caseId = await kase(a, id, { openedOn: "2026-01-01" });
      expect(await as(a, (tx, physioId) => reopenCase(tx, physioId, caseId))).toEqual({
        ok: false,
        error: "notClosed",
      });
      await as(a, (tx, physioId) => closeCase(tx, physioId, caseId, "2026-01-05"));
      expect(await as(a, (tx, physioId) => closeCase(tx, physioId, caseId, "2026-01-09"))).toEqual({
        ok: false,
        error: "notOpen",
      });
      expect((await storedCase(caseId)).closedOn).toBe("2026-01-05");
    });

    it("reports notFound for another physio's or a random case", async () => {
      const id = await customer(a, { firstName: "Guarded" });
      const caseId = await kase(a, id, { openedOn: "2026-01-01" });
      expect(await as(b, (tx, physioId) => closeCase(tx, physioId, caseId, "2026-01-05"))).toEqual({
        ok: false,
        error: "notFound",
      });
      expect(await as(b, (tx, physioId) => reopenCase(tx, physioId, caseId))).toEqual({
        ok: false,
        error: "notFound",
      });
      expect(
        await as(a, (tx, physioId) => closeCase(tx, physioId, RANDOM_ID, "2026-01-05")),
      ).toEqual({
        ok: false,
        error: "notFound",
      });
      expect((await storedCase(caseId)).status).toBe("open");
    });

    it("lets exactly one of two concurrent closes win", async () => {
      const id = await customer(a, { firstName: "Race" });
      const caseId = await kase(a, id, { openedOn: "2026-01-01" });
      const results = await Promise.all([
        as(a, (tx, physioId) => closeCase(tx, physioId, caseId, "2026-01-05")),
        as(a, (tx, physioId) => closeCase(tx, physioId, caseId, "2026-01-06")),
      ]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, error: "notOpen" }]);
    });
  });

  describe("malformed ids", () => {
    it.each(["nope", ""])(
      "are reported as not found without aborting the transaction (%j)",
      async (bad) => {
        const id = await customer(a, { firstName: "Malformed" });
        const results = await as(a, async (tx, physioId) => {
          const out = {
            get: await getCustomer(tx, physioId, bad),
            update: await updateCustomer(tx, physioId, bad, customerInput()),
            archive: await setCustomerArchived(tx, physioId, bad, true),
            restore: await setCustomerArchived(tx, physioId, bad, false),
            createCase: await createCase(tx, physioId, bad, caseInput(), "2026-03-10"),
            updateCase: await updateCase(tx, physioId, bad, caseInput()),
            close: await closeCase(tx, physioId, bad, "2026-03-10"),
            reopen: await reopenCase(tx, physioId, bad),
          };
          // the transaction must still be usable
          const after = await getCustomer(tx, physioId, id);
          return { out, after };
        });
        expect(results.out).toEqual({
          get: null,
          update: { ok: false, error: "notFound" },
          archive: { ok: false, error: "notFound" },
          restore: { ok: false, error: "notFound" },
          createCase: { ok: false, error: "customerNotFound" },
          updateCase: { ok: false, error: "notFound" },
          close: { ok: false, error: "notFound" },
          reopen: { ok: false, error: "notFound" },
        });
        expect(results.after?.firstName).toBe("Malformed");
      },
    );
  });
});
