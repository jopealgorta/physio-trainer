import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { runAsPhysio } from "@/db/rls";
import { cases, customers } from "@/db/schema";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";

const rejectsWith = (code: string, constraint_name?: string) => ({
  cause: expect.objectContaining(constraint_name ? { code, constraint_name } : { code }),
});

const wait = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("customers and cases tables", () => {
  let a: TestPhysio;
  let b: TestPhysio;
  let aCustomer: string;
  let aCase: string;

  beforeAll(async () => {
    [a, b] = await Promise.all([
      createTestPhysio({ onboarded: true }),
      createTestPhysio({ onboarded: true }),
    ]);
    await runAsPhysio(a.claims, async (tx, physioId) => {
      [{ id: aCustomer }] = await tx
        .insert(customers)
        .values({ physioId, firstName: "Ana", lastName: "Pérez", locale: "es" })
        .returning({ id: customers.id });
      [{ id: aCase }] = await tx
        .insert(cases)
        .values({ physioId, customerId: aCustomer, title: "Knee sprain" })
        .returning({ id: cases.id });
    });
  });

  afterAll(() => deleteTestPhysios(a, b));

  it.each([
    ["customers", customers],
    ["cases", cases],
  ] as const)("RLS hides %s rows from other physios", async (name, table) => {
    expect(await runAsPhysio(b.claims, (tx) => tx.select().from(table))).toEqual([]);
    const seeded = { customers: aCustomer, cases: aCase }[name];
    const visibleToA = await runAsPhysio(a.claims, (tx) => tx.select({ id: table.id }).from(table));
    expect(visibleToA.map((row) => row.id)).toContain(seeded);
  });

  it("RLS blocks updates and deletes of another physio's rows", async () => {
    const updatedCustomer = await runAsPhysio(b.claims, (tx) =>
      tx
        .update(customers)
        .set({ firstName: "Hijacked" })
        .where(eq(customers.id, aCustomer))
        .returning(),
    );
    const updatedCase = await runAsPhysio(b.claims, (tx) =>
      tx.update(cases).set({ title: "Hijacked" }).where(eq(cases.id, aCase)).returning(),
    );
    const deletedCase = await runAsPhysio(b.claims, (tx) =>
      tx.delete(cases).where(eq(cases.id, aCase)).returning(),
    );
    const deletedCustomer = await runAsPhysio(b.claims, (tx) =>
      tx.delete(customers).where(eq(customers.id, aCustomer)).returning(),
    );
    expect([updatedCustomer, updatedCase, deletedCase, deletedCustomer]).toEqual([[], [], [], []]);
  });

  it("RLS blocks inserting a customer owned by someone else", async () => {
    await expect(
      runAsPhysio(b.claims, (tx) =>
        tx.insert(customers).values({ physioId: a.id, firstName: "Intruder", locale: "en" }),
      ),
    ).rejects.toMatchObject(rejectsWith("42501"));
  });

  it("RLS blocks inserting a case owned by someone else", async () => {
    // Physio B's own customer, but the case claims A as its owner.
    const bCustomer = await runAsPhysio(b.claims, async (tx, physioId) => {
      const [row] = await tx
        .insert(customers)
        .values({ physioId, firstName: "Bea", locale: "en" })
        .returning({ id: customers.id });
      return row.id;
    });
    for (const customerId of [bCustomer, aCustomer]) {
      await expect(
        runAsPhysio(b.claims, (tx) =>
          tx.insert(cases).values({ physioId: a.id, customerId, title: "Planted" }),
        ),
      ).rejects.toMatchObject(rejectsWith("42501"));
    }
    expect(await db.select().from(cases).where(eq(cases.title, "Planted"))).toEqual([]);
  });

  it("RLS blocks reassigning your own rows to another physio", async () => {
    const { customerId, caseId } = await runAsPhysio(b.claims, async (tx, physioId) => {
      const [customer] = await tx
        .insert(customers)
        .values({ physioId, firstName: "Mine", locale: "en" })
        .returning({ id: customers.id });
      const [kase] = await tx
        .insert(cases)
        .values({ physioId, customerId: customer.id, title: "Mine" })
        .returning({ id: cases.id });
      return { customerId: customer.id, caseId: kase.id };
    });
    await expect(
      runAsPhysio(b.claims, (tx) =>
        tx.update(customers).set({ physioId: a.id }).where(eq(customers.id, customerId)),
      ),
    ).rejects.toMatchObject(rejectsWith("42501"));
    await expect(
      runAsPhysio(b.claims, (tx) =>
        tx.update(cases).set({ physioId: a.id }).where(eq(cases.id, caseId)),
      ),
    ).rejects.toMatchObject(rejectsWith("42501"));
    const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
    const [kase] = await db.select().from(cases).where(eq(cases.id, caseId));
    expect([customer.physioId, kase.physioId]).toEqual([b.id, b.id]);
  });

  it("rejects a case pointing at another physio's customer", async () => {
    await expect(
      runAsPhysio(b.claims, (tx, physioId) =>
        tx.insert(cases).values({ physioId, customerId: aCustomer, title: "Sneaky" }),
      ),
    ).rejects.toMatchObject(rejectsWith("23503", "cases_customer_fk"));
  });

  it("deleting a customer cascades to its cases", async () => {
    const remaining = await runAsPhysio(a.claims, async (tx, physioId) => {
      const [customer] = await tx
        .insert(customers)
        .values({ physioId, firstName: "Temp", locale: "en" })
        .returning();
      await tx.insert(cases).values([
        { physioId, customerId: customer.id, title: "One" },
        { physioId, customerId: customer.id, title: "Two" },
      ]);
      await tx.delete(customers).where(eq(customers.id, customer.id));
      return tx.select().from(cases).where(eq(cases.customerId, customer.id));
    });
    expect(remaining).toEqual([]);
  });

  it("defaults a new case to open, opened today", async () => {
    const [row] = await runAsPhysio(a.claims, (tx) =>
      tx.select().from(cases).where(eq(cases.id, aCase)),
    );
    expect(row.status).toBe("open");
    expect(row.openedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(row.closedOn).toBeNull();
  });

  it.each([
    ["initial pain above 10", { initialPain: 11 }, "cases_initial_pain_range"],
    ["full_body area", { bodyArea: "full_body" as const }, "cases_area_not_full_body"],
    [
      "closed status without closedOn",
      { status: "closed" as const },
      "cases_closed_on_matches_status",
    ],
    [
      "closedOn on an open case",
      { openedOn: "2026-01-01", closedOn: "2026-01-01" },
      "cases_closed_on_matches_status",
    ],
    [
      "closedOn before openedOn",
      { status: "closed" as const, openedOn: "2026-02-01", closedOn: "2026-01-01" },
      "cases_closed_not_before_opened",
    ],
    ["side without area", { side: "left" as const }, "cases_side_needs_area"],
    ["empty title", { title: "" }, "cases_title_length"],
  ])("rejects a case with %s", async (_label, values, constraint) => {
    await expect(
      runAsPhysio(a.claims, (tx, physioId) =>
        tx.insert(cases).values({ physioId, customerId: aCustomer, title: "Bad", ...values }),
      ),
    ).rejects.toMatchObject(rejectsWith("23514", constraint));
  });

  it("accepts a fully specified case", async () => {
    const [row] = await runAsPhysio(a.claims, (tx, physioId) =>
      tx
        .insert(cases)
        .values({
          physioId,
          customerId: aCustomer,
          title: "ACL rehab",
          bodyArea: "knee",
          side: "left",
          initialPain: 0,
          status: "closed",
          openedOn: "2026-01-01",
          closedOn: "2026-01-01",
        })
        .returning(),
    );
    expect(row).toMatchObject({ bodyArea: "knee", side: "left", status: "closed" });
  });

  it("rejects customers with an empty or oversized name", async () => {
    await expect(
      runAsPhysio(a.claims, (tx, physioId) =>
        tx.insert(customers).values({ physioId, firstName: "", locale: "en" }),
      ),
    ).rejects.toMatchObject(rejectsWith("23514", "customers_first_name_length"));
    await expect(
      runAsPhysio(a.claims, (tx, physioId) =>
        tx.insert(customers).values({ physioId, firstName: "x".repeat(61), locale: "en" }),
      ),
    ).rejects.toMatchObject(rejectsWith("23514", "customers_first_name_length"));
  });

  it("advances updated_at on update for both tables", async () => {
    // now() is frozen inside a transaction, so insert and update run in separate ones.
    const { customer, kase } = await runAsPhysio(a.claims, async (tx, physioId) => {
      const [customer] = await tx
        .insert(customers)
        .values({ physioId, firstName: "Clock", locale: "en" })
        .returning();
      const [kase] = await tx
        .insert(cases)
        .values({ physioId, customerId: customer.id, title: "Clock" })
        .returning();
      return { customer, kase };
    });
    await wait();
    const { customerAfter, caseAfter } = await runAsPhysio(a.claims, async (tx) => {
      const [customerAfter] = await tx
        .update(customers)
        .set({ occupation: "Runner" })
        .where(eq(customers.id, customer.id))
        .returning();
      const [caseAfter] = await tx
        .update(cases)
        .set({ notes: "Updated" })
        .where(eq(cases.id, kase.id))
        .returning();
      return { customerAfter, caseAfter };
    });
    expect(customerAfter.updatedAt.getTime()).toBeGreaterThan(customer.updatedAt.getTime());
    expect(caseAfter.updatedAt.getTime()).toBeGreaterThan(kase.updatedAt.getTime());
  });

  it("stores the customer under the owning physio only", async () => {
    const rows = await db.select().from(customers).where(eq(customers.id, aCustomer));
    expect(rows[0]).toMatchObject({ physioId: a.id, archivedAt: null });
  });
});
