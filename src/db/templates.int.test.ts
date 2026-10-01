import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { isCheckViolation, isForeignKeyViolation } from "@/db/errors";
import { runAsPhysio } from "@/db/rls";
import { cases, customers, routines, weeklyPlans } from "@/db/schema";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";

describe("template columns (spec 07)", () => {
  let a: TestPhysio;
  let b: TestPhysio;
  let aCustomer: string;
  let aCase: string;

  beforeAll(async () => {
    [a, b] = await Promise.all([
      createTestPhysio({ onboarded: true }),
      createTestPhysio({ onboarded: true }),
    ]);
    [{ id: aCustomer }] = await db
      .insert(customers)
      .values({ physioId: a.id, firstName: "Ana", locale: "es" })
      .returning({ id: customers.id });
    [{ id: aCase }] = await db
      .insert(cases)
      .values({ physioId: a.id, customerId: aCustomer, title: "Knee" })
      .returning({ id: cases.id });
  });

  afterAll(() => deleteTestPhysios(a, b));

  describe("routines", () => {
    it("accepts a valid template: no customer, active", async () => {
      const [row] = await db
        .insert(routines)
        .values({ physioId: a.id, isTemplate: true, name: "Tpl", status: "active" })
        .returning();
      expect(row).toMatchObject({ isTemplate: true, customerId: null, sourceTemplateId: null });
    });

    it("rejects a template with a customer, and a non-template without one", async () => {
      await expect(
        db.insert(routines).values({
          physioId: a.id,
          customerId: aCustomer,
          isTemplate: true,
          name: "Bad",
          status: "active",
        }),
      ).rejects.toSatisfy((error) => isCheckViolation(error, "routines_template_customer"));
      await expect(
        db.insert(routines).values({ physioId: a.id, isTemplate: false, name: "Bad" }),
      ).rejects.toSatisfy((error) => isCheckViolation(error, "routines_template_customer"));
    });

    it("rejects a draft template", async () => {
      await expect(
        db
          .insert(routines)
          .values({ physioId: a.id, isTemplate: true, name: "Draft", status: "draft" }),
      ).rejects.toSatisfy((error) => isCheckViolation(error, "routines_template_not_draft"));
    });

    it("rejects a case without a customer", async () => {
      await expect(
        db.insert(routines).values({
          physioId: a.id,
          isTemplate: true,
          caseId: aCase,
          name: "Case",
          status: "active",
        }),
      ).rejects.toSatisfy((error) => isCheckViolation(error, "routines_case_needs_customer"));
    });

    it("rejects a copy pointing at another physio's template", async () => {
      const [bTemplate] = await db
        .insert(routines)
        .values({ physioId: b.id, isTemplate: true, name: "B tpl", status: "active" })
        .returning();
      await expect(
        db.insert(routines).values({
          physioId: a.id,
          customerId: aCustomer,
          name: "Copy",
          sourceTemplateId: bTemplate.id,
        }),
      ).rejects.toSatisfy((error) => isForeignKeyViolation(error, "routines_source_template_fk"));
    });

    it("deleting the template clears only source_template_id on copies", async () => {
      const [template] = await db
        .insert(routines)
        .values({ physioId: a.id, isTemplate: true, name: "Tpl", status: "active" })
        .returning();
      const [copy] = await db
        .insert(routines)
        .values({
          physioId: a.id,
          customerId: aCustomer,
          name: "Copy",
          sourceTemplateId: template.id,
        })
        .returning();
      expect(copy.sourceTemplateId).toBe(template.id);
      await db.delete(routines).where(eq(routines.id, template.id));
      const [after] = await db.select().from(routines).where(eq(routines.id, copy.id));
      expect(after).toMatchObject({
        sourceTemplateId: null,
        physioId: a.id,
        customerId: aCustomer,
      });
    });

    it("RLS hides one physio's templates from another", async () => {
      const [template] = await db
        .insert(routines)
        .values({ physioId: a.id, isTemplate: true, name: "Secret", status: "active" })
        .returning();
      const seenByB = await runAsPhysio(b.claims, (tx) => tx.select().from(routines));
      expect(seenByB.map((row) => row.id)).not.toContain(template.id);
      const seenByA = await runAsPhysio(a.claims, (tx) => tx.select().from(routines));
      expect(seenByA.map((row) => row.id)).toContain(template.id);
    });
  });

  describe("weekly plans", () => {
    it("accepts a valid template: no customer, active", async () => {
      const [row] = await db
        .insert(weeklyPlans)
        .values({ physioId: a.id, isTemplate: true, name: "Tpl", status: "active" })
        .returning();
      expect(row).toMatchObject({ isTemplate: true, customerId: null, sourceTemplateId: null });
    });

    it("rejects a template with a customer, and a non-template without one", async () => {
      await expect(
        db.insert(weeklyPlans).values({
          physioId: a.id,
          customerId: aCustomer,
          isTemplate: true,
          name: "Bad",
          status: "active",
        }),
      ).rejects.toSatisfy((error) => isCheckViolation(error, "weekly_plans_template_customer"));
      await expect(
        db.insert(weeklyPlans).values({ physioId: a.id, isTemplate: false, name: "Bad" }),
      ).rejects.toSatisfy((error) => isCheckViolation(error, "weekly_plans_template_customer"));
    });

    it("rejects a draft template", async () => {
      await expect(
        db
          .insert(weeklyPlans)
          .values({ physioId: a.id, isTemplate: true, name: "Draft", status: "draft" }),
      ).rejects.toSatisfy((error) => isCheckViolation(error, "weekly_plans_template_not_draft"));
    });

    it("rejects a case without a customer", async () => {
      await expect(
        db.insert(weeklyPlans).values({
          physioId: a.id,
          isTemplate: true,
          caseId: aCase,
          name: "Case",
          status: "active",
        }),
      ).rejects.toSatisfy((error) => isCheckViolation(error, "weekly_plans_case_needs_customer"));
    });

    it("rejects a copy pointing at another physio's template", async () => {
      const [bTemplate] = await db
        .insert(weeklyPlans)
        .values({ physioId: b.id, isTemplate: true, name: "B tpl", status: "active" })
        .returning();
      await expect(
        db.insert(weeklyPlans).values({
          physioId: a.id,
          customerId: aCustomer,
          name: "Copy",
          sourceTemplateId: bTemplate.id,
        }),
      ).rejects.toSatisfy((error) =>
        isForeignKeyViolation(error, "weekly_plans_source_template_fk"),
      );
    });

    it("deleting the template clears only source_template_id on copies", async () => {
      const [template] = await db
        .insert(weeklyPlans)
        .values({ physioId: a.id, isTemplate: true, name: "Tpl", status: "active" })
        .returning();
      const [copy] = await db
        .insert(weeklyPlans)
        .values({
          physioId: a.id,
          customerId: aCustomer,
          name: "Copy",
          sourceTemplateId: template.id,
        })
        .returning();
      expect(copy.sourceTemplateId).toBe(template.id);
      await db.delete(weeklyPlans).where(eq(weeklyPlans.id, template.id));
      const [after] = await db.select().from(weeklyPlans).where(eq(weeklyPlans.id, copy.id));
      expect(after).toMatchObject({
        sourceTemplateId: null,
        physioId: a.id,
        customerId: aCustomer,
      });
    });
  });
});
