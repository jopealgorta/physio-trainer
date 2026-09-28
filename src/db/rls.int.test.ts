import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { physios } from "@/db/schema";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";

import { runAsPhysio } from "./rls";

describe("runAsPhysio (RLS on physios)", () => {
  let a: TestPhysio;
  let b: TestPhysio;

  beforeAll(async () => {
    [a, b] = await Promise.all([
      createTestPhysio({ onboarded: true }),
      createTestPhysio({ onboarded: true }),
    ]);
  });

  afterAll(() => deleteTestPhysios(a, b));

  it("passes the physio id from the claims", async () => {
    expect(await runAsPhysio(a.claims, async (_tx, physioId) => physioId)).toBe(a.id);
  });

  it("shows a physio only their own row", async () => {
    const rows = await runAsPhysio(a.claims, (tx) => tx.select({ id: physios.id }).from(physios));
    expect(rows).toEqual([{ id: a.id }]);
  });

  it("hides another physio's row even when asked for it by id", async () => {
    const rows = await runAsPhysio(a.claims, (tx) =>
      tx.select().from(physios).where(eq(physios.id, b.id)),
    );
    expect(rows).toEqual([]);
  });

  it("cannot update another physio's row", async () => {
    const updated = await runAsPhysio(a.claims, (tx) =>
      tx
        .update(physios)
        .set({ displayName: "Hijacked" })
        .where(eq(physios.id, b.id))
        .returning({ id: physios.id }),
    );
    expect(updated).toEqual([]);
    const [row] = await db.select().from(physios).where(eq(physios.id, b.id));
    expect(row.displayName).not.toBe("Hijacked");
  });

  it("can update its own row", async () => {
    const updated = await runAsPhysio(a.claims, (tx, physioId) =>
      tx
        .update(physios)
        .set({ displayName: "Own Update" })
        .where(eq(physios.id, physioId))
        .returning({ displayName: physios.displayName }),
    );
    expect(updated).toEqual([{ displayName: "Own Update" }]);
  });

  it("cannot insert physio rows", async () => {
    await expect(
      runAsPhysio(a.claims, (tx) =>
        tx.insert(physios).values({
          id: crypto.randomUUID(),
          email: "x@example.test",
          displayName: "Intruder",
          handle: `intruder-${a.id.slice(0, 8)}`,
        }),
      ),
    ).rejects.toThrow();
  });

  it("cannot delete physio rows, not even its own", async () => {
    const deleted = await runAsPhysio(a.claims, (tx, physioId) =>
      tx.delete(physios).where(eq(physios.id, physioId)).returning({ id: physios.id }),
    );
    expect(deleted).toEqual([]);
  });

  it("sees nothing as the authenticated role without claims", async () => {
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role authenticated`);
      return tx.select().from(physios);
    });
    expect(rows).toEqual([]);
  });

  it("reports handle availability without revealing rows", async () => {
    const [bRow] = await db.select().from(physios).where(eq(physios.id, b.id));
    const [aRow] = await db.select().from(physios).where(eq(physios.id, a.id));
    const check = (handle: string) =>
      runAsPhysio(a.claims, async (tx) => {
        const [row] = await tx.execute<{ available: boolean }>(
          sql`select public.is_handle_available(${handle}) as available`,
        );
        return row.available;
      });

    expect(await check(bRow.handle)).toBe(false);
    expect(await check(aRow.handle)).toBe(true);
    expect(await check(`free-${crypto.randomUUID().slice(0, 8)}`)).toBe(true);
  });

  it("does not let anonymous users call is_handle_available", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`set local role anon`);
        await tx.execute(sql`select public.is_handle_available('anything')`);
      }),
    ).rejects.toThrow();
  });
});
