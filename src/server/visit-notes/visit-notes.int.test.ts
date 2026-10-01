import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { runAsPhysio } from "@/db/rls";
import { cases, visitNotes } from "@/db/schema";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";
import { createCase, createCustomer } from "@/server/customers/mutations";
import { caseSchema, customerSchema } from "@/server/customers/schemas";

import { createVisitNote, deleteVisitNote, updateVisitNote } from "./mutations";
import { latestVisitNote, listVisitNotes } from "./queries";
import { visitNoteSchema, type VisitNoteInput } from "./schemas";

const RANDOM_ID = "0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10";
const TODAY = "2026-10-01";

const noteInput = (overrides: Record<string, unknown> = {}): VisitNoteInput =>
  visitNoteSchema.parse({ subjective: "Knee pain", ...overrides });

describe("visit notes server layer", () => {
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
  const customer = async (who: TestPhysio) => {
    const result = await as(who, (tx, id) =>
      createCustomer(tx, id, customerSchema.parse({ firstName: "Ana" })),
    );
    if (!result.ok) throw new Error("createCustomer failed");
    return result.data.id;
  };
  const kase = async (who: TestPhysio, customerId: string) => {
    const result = await as(who, (tx, id) =>
      createCase(tx, id, customerId, caseSchema.parse({ title: "Knee rehab" }), TODAY),
    );
    if (!result.ok) throw new Error("createCase failed");
    return result.data.id;
  };
  const note = async (
    who: TestPhysio,
    customerId: string,
    overrides: Record<string, unknown> = {},
  ) => {
    const result = await as(who, (tx, id) =>
      createVisitNote(tx, id, customerId, noteInput(overrides), TODAY),
    );
    if (!result.ok) throw new Error(`createVisitNote failed: ${result.error}`);
    return result.data.id;
  };
  const stored = async (id: string) =>
    (await db.select().from(visitNotes).where(eq(visitNotes.id, id)))[0];

  beforeAll(async () => {
    [a, b] = await Promise.all([fresh(), fresh()]);
  });
  afterAll(() => deleteTestPhysios(...created));

  describe("createVisitNote", () => {
    it("stores every field for the owning physio and defaults the date to today", async () => {
      const customerId = await customer(a);
      const caseId = await kase(a, customerId);
      const id = await note(a, customerId, {
        caseId,
        objective: "ROM 0-120",
        assessment: "Improving",
        plan: "Add squats",
        pain: "3",
      });
      expect(await stored(id)).toMatchObject({
        physioId: a.id,
        customerId,
        caseId,
        visitedOn: TODAY,
        subjective: "Knee pain",
        objective: "ROM 0-120",
        assessment: "Improving",
        plan: "Add squats",
        pain: 3,
      });
    });

    it("uses the given date", async () => {
      const customerId = await customer(a);
      const id = await note(a, customerId, { visitedOn: "2026-09-15" });
      expect((await stored(id)).visitedOn).toBe("2026-09-15");
    });

    it("rejects another physio's customer, a malformed id and an unknown customer", async () => {
      const theirs = await customer(b);
      for (const customerId of [theirs, "not-a-uuid", RANDOM_ID]) {
        const result = await as(a, (tx, id) =>
          createVisitNote(tx, id, customerId, noteInput(), TODAY),
        );
        expect(result).toEqual({ ok: false, error: "customerNotFound" });
      }
    });

    it("rejects a case of another customer (same physio) or another physio", async () => {
      const customerId = await customer(a);
      const otherCustomer = await customer(a);
      const sameOwnerCase = await kase(a, otherCustomer);
      const foreignCase = await kase(b, await customer(b));
      for (const caseId of [sameOwnerCase, foreignCase, RANDOM_ID]) {
        const result = await as(a, (tx, id) =>
          createVisitNote(tx, id, customerId, noteInput({ caseId }), TODAY),
        );
        expect(result).toEqual({ ok: false, error: "caseNotFound" });
      }
    });

    it("is enforced by the database: a note without any SOAP text cannot be stored", async () => {
      const customerId = await customer(a);
      await expect(
        db.insert(visitNotes).values({ physioId: a.id, customerId, subjective: "  " }),
      ).rejects.toThrow();
    });
  });

  describe("updateVisitNote", () => {
    it("replaces the content, keeps the date when none is given and bumps updated_at", async () => {
      const customerId = await customer(a);
      const id = await note(a, customerId, { visitedOn: "2026-09-10", pain: "5" });
      await db
        .update(visitNotes)
        .set({
          createdAt: sql`now() - interval '1 hour'`,
          updatedAt: sql`now() - interval '1 hour'`,
        })
        .where(eq(visitNotes.id, id));
      const before = await stored(id);

      const result = await as(a, (tx, physioId) =>
        updateVisitNote(tx, physioId, id, noteInput({ subjective: "", assessment: "Better" })),
      );
      expect(result).toEqual({ ok: true, data: null });

      const after = await stored(id);
      expect(after).toMatchObject({
        subjective: null,
        assessment: "Better",
        pain: null,
        visitedOn: "2026-09-10",
      });
      expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
      expect(after.createdAt.getTime()).toBe(before.createdAt.getTime());
    });

    it("can set and clear the case", async () => {
      const customerId = await customer(a);
      const caseId = await kase(a, customerId);
      const id = await note(a, customerId);
      await as(a, (tx, p) => updateVisitNote(tx, p, id, noteInput({ caseId })));
      expect((await stored(id)).caseId).toBe(caseId);
      await as(a, (tx, p) => updateVisitNote(tx, p, id, noteInput({ caseId: "" })));
      expect((await stored(id)).caseId).toBeNull();
    });

    it("rejects a case of another customer and leaves the note unchanged", async () => {
      const customerId = await customer(a);
      const id = await note(a, customerId);
      const otherCase = await kase(a, await customer(a));
      const result = await as(a, (tx, p) =>
        updateVisitNote(tx, p, id, noteInput({ caseId: otherCase, subjective: "Changed" })),
      );
      expect(result).toEqual({ ok: false, error: "caseNotFound" });
      expect((await stored(id)).subjective).toBe("Knee pain");
    });

    it("does not touch another physio's note or a malformed id", async () => {
      const id = await note(b, await customer(b));
      const theirs = await as(a, (tx, p) =>
        updateVisitNote(tx, p, id, noteInput({ subjective: "Hacked" })),
      );
      expect(theirs).toEqual({ ok: false, error: "notFound" });
      expect((await stored(id)).subjective).toBe("Knee pain");
      const malformed = await as(a, (tx, p) => updateVisitNote(tx, p, "nope", noteInput()));
      expect(malformed).toEqual({ ok: false, error: "notFound" });
    });
  });

  describe("deleteVisitNote", () => {
    it("deletes own notes only", async () => {
      const mine = await note(a, await customer(a));
      const theirs = await note(b, await customer(b));
      expect(await as(a, (tx, p) => deleteVisitNote(tx, p, theirs))).toEqual({
        ok: false,
        error: "notFound",
      });
      expect(await stored(theirs)).toBeDefined();
      expect(await as(a, (tx, p) => deleteVisitNote(tx, p, mine))).toEqual({
        ok: true,
        data: null,
      });
      expect(await stored(mine)).toBeUndefined();
      expect(await as(a, (tx, p) => deleteVisitNote(tx, p, mine))).toEqual({
        ok: false,
        error: "notFound",
      });
    });
  });

  describe("listVisitNotes", () => {
    let p: TestPhysio;
    let customerId: string;
    let caseA: string;
    let caseB: string;
    const ids: Record<string, string> = {};

    beforeAll(async () => {
      p = await fresh();
      customerId = await customer(p);
      caseA = await kase(p, customerId);
      caseB = await kase(p, customerId);
      ids.old = await note(p, customerId, { visitedOn: "2026-09-01", caseId: caseA });
      ids.mid = await note(p, customerId, { visitedOn: "2026-09-15", caseId: caseB });
      ids.newer = await note(p, customerId, { visitedOn: "2026-09-30", caseId: caseA });
      ids.sameDay = await note(p, customerId, { visitedOn: "2026-09-30" });
      await note(p, await customer(p), { visitedOn: "2026-10-01" });
    });

    it("lists the customer's notes newest visit first, ties by creation", async () => {
      const { notes, hasMore } = await as(p, (tx, id) =>
        listVisitNotes(tx, id, customerId, { caseId: null, limit: 20 }),
      );
      expect(notes.map((n) => n.id)).toEqual([ids.sameDay, ids.newer, ids.mid, ids.old]);
      expect(hasMore).toBe(false);
    });

    it("filters by case", async () => {
      const { notes } = await as(p, (tx, id) =>
        listVisitNotes(tx, id, customerId, { caseId: caseA, limit: 20 }),
      );
      expect(notes.map((n) => n.id)).toEqual([ids.newer, ids.old]);
    });

    it("pages with a limit and reports whether more exist", async () => {
      const first = await as(p, (tx, id) =>
        listVisitNotes(tx, id, customerId, { caseId: null, limit: 3 }),
      );
      expect(first.notes).toHaveLength(3);
      expect(first.hasMore).toBe(true);
      const exact = await as(p, (tx, id) =>
        listVisitNotes(tx, id, customerId, { caseId: null, limit: 4 }),
      );
      expect(exact.notes).toHaveLength(4);
      expect(exact.hasMore).toBe(false);
    });

    it("returns nothing for another physio's customer or a malformed id", async () => {
      for (const id of [customerId, "nope"]) {
        const { notes } = await as(a, (tx, physioId) =>
          listVisitNotes(tx, physioId, id, { caseId: null, limit: 20 }),
        );
        expect(notes).toEqual([]);
      }
    });

    it("gives the latest note, or null when there is none", async () => {
      const latest = await as(p, (tx, id) => latestVisitNote(tx, id, customerId));
      expect(latest?.id).toBe(ids.sameDay);
      const none = await as(a, (tx, id) => latestVisitNote(tx, id, customerId));
      expect(none).toBeNull();
    });
  });

  describe("deleting a case", () => {
    it("does not make its notes look edited", async () => {
      const customerId = await customer(a);
      const caseId = await kase(a, customerId);
      const id = await note(a, customerId, { caseId });
      await db
        .update(visitNotes)
        .set({ createdAt: sql`now() - interval '1 hour'` })
        .where(eq(visitNotes.id, id));
      // Align updated_at with created_at without the trigger bumping it back to now().
      await db.transaction(async (tx) => {
        await tx.execute(sql`set local session_replication_role = replica`);
        await tx.execute(sql`update visit_notes set updated_at = created_at where id = ${id}`);
      });
      const before = await stored(id);
      expect(before.updatedAt.getTime()).toBe(before.createdAt.getTime());

      await db.delete(cases).where(eq(cases.id, caseId));
      const after = await stored(id);
      expect(after.caseId).toBeNull();
      expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    });

    it("still bumps updated_at when the case is cleared together with a content change", async () => {
      const customerId = await customer(a);
      const caseId = await kase(a, customerId);
      const id = await note(a, customerId, { caseId });
      const before = await stored(id);
      await new Promise((resolve) => setTimeout(resolve, 20));
      const result = await as(a, (tx, p) =>
        updateVisitNote(tx, p, id, noteInput({ caseId: "", subjective: "Changed" })),
      );
      expect(result.ok).toBe(true);
      expect((await stored(id)).updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    });

    it("clears only case_id on its notes", async () => {
      const customerId = await customer(a);
      const caseId = await kase(a, customerId);
      const id = await note(a, customerId, { caseId });
      await db.delete(cases).where(eq(cases.id, caseId));
      expect(await stored(id)).toMatchObject({ caseId: null, physioId: a.id, customerId });
    });
  });

  describe("row level security", () => {
    it("hides other physios' notes from reads and blocks their writes", async () => {
      const customerId = await customer(a);
      const id = await note(a, customerId, { subjective: "Private" });

      const visible = await runAsPhysio(b.claims, (tx) =>
        tx.select({ id: visitNotes.id }).from(visitNotes).where(eq(visitNotes.id, id)),
      );
      expect(visible).toEqual([]);

      const updated = await runAsPhysio(b.claims, (tx) =>
        tx
          .update(visitNotes)
          .set({ subjective: "x" })
          .where(eq(visitNotes.id, id))
          .returning({ id: visitNotes.id }),
      );
      expect(updated).toEqual([]);

      const deleted = await runAsPhysio(b.claims, (tx) =>
        tx.delete(visitNotes).where(eq(visitNotes.id, id)).returning({ id: visitNotes.id }),
      );
      expect(deleted).toEqual([]);
      expect((await stored(id)).subjective).toBe("Private");
    });

    it("blocks inserting a row as someone else", async () => {
      const customerId = await customer(a);
      await expect(
        runAsPhysio(b.claims, (tx) =>
          tx.insert(visitNotes).values({ physioId: a.id, customerId, subjective: "x" }),
        ),
      ).rejects.toThrow();
    });
  });

  describe("cascades", () => {
    it("deletes notes with their customer's physio", async () => {
      const gone = await fresh();
      const id = await note(gone, await customer(gone));
      await deleteTestPhysios(gone);
      expect(await stored(id)).toBeUndefined();
    });
  });
});
