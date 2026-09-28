import "server-only";

import type { JwtPayload } from "@supabase/supabase-js";
import { sql } from "drizzle-orm";

import { db } from "@/db";

/** A Drizzle transaction; physio-facing queries and mutations take one. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Runs `fn` in a transaction as the `authenticated` role with the given (verified) JWT claims,
 * so Postgres RLS applies to every query. `claims` must come from getClaims() (or tests).
 * App code uses withPhysio() (src/server/auth/session.ts), which supplies the session's claims.
 */
export async function runAsPhysio<T>(
  claims: JwtPayload,
  fn: (tx: Tx, physioId: string) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`);
    await tx.execute(sql`set local role authenticated`);
    return fn(tx, claims.sub);
  });
}
