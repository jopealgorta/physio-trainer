import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";

// A one-connection pool: runAsPhysio's transaction and the check after it must share a
// connection, or the check could pass on a different one by accident.
vi.mock("@/db", async () => {
  const [{ drizzle }, { default: postgres }, schema] = await Promise.all([
    import("drizzle-orm/postgres-js"),
    import("postgres"),
    import("@/db/schema"),
  ]);
  const client = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  return { db: drizzle(client, { schema, casing: "snake_case" }), client };
});

const { db } = await import("@/db");
const { runAsPhysio } = await import("./rls");

type Session = { pid: number; role: string; claims: string | null };
const session = sql`select pg_backend_pid() as pid, current_user as role,
  nullif(current_setting('request.jwt.claims', true), '') as claims`;

describe("runAsPhysio on a pooled connection", () => {
  let a: TestPhysio;

  beforeAll(async () => {
    a = await createTestPhysio({ onboarded: true });
  });

  afterAll(() => deleteTestPhysios(a));

  it("hands the connection back as the owner, with no claims (SET LOCAL semantics)", async () => {
    const inside = await runAsPhysio(a.claims, async (tx) => {
      const [row] = await tx.execute<Session>(session);
      return row;
    });
    expect(inside.role).toBe("authenticated");
    expect(inside.claims).not.toBeNull();

    const [after] = await db.execute<Session>(session);
    expect(after).toEqual({ pid: inside.pid, role: "postgres", claims: null });
  });

  it("also resets after a transaction that failed", async () => {
    let pid = 0;
    await expect(
      runAsPhysio(a.claims, async (tx) => {
        const [row] = await tx.execute<Session>(session);
        pid = row.pid;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const [after] = await db.execute<Session>(session);
    expect(after).toEqual({ pid, role: "postgres", claims: null });
  });
});
