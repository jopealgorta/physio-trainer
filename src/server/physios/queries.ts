import "server-only";

import { eq, sql } from "drizzle-orm";

import type { Tx } from "@/db/rls";
import { physios, type Physio } from "@/db/schema";
import { handleCandidates } from "@/lib/handles";

export async function getProfile(tx: Tx, physioId: string): Promise<Physio | null> {
  const [row] = await tx.select().from(physios).where(eq(physios.id, physioId));
  return row ?? null;
}

export async function isHandleAvailable(tx: Tx, handle: string): Promise<boolean> {
  const [row] = await tx.execute<{ available: boolean }>(
    sql`select public.is_handle_available(${handle}) as available`,
  );
  return row?.available === true;
}

/** First free handle derived from the name ("maria-lopez", "maria-lopez-2", …), or null. */
export async function suggestHandle(tx: Tx, displayName: string): Promise<string | null> {
  const candidates = handleCandidates(displayName);
  const list = sql.join(
    candidates.map((candidate) => sql`${candidate}`),
    sql`, `,
  );
  const [row] = await tx.execute<{ handle: string }>(sql`
    select candidate.handle
    from unnest(array[${list}]::text[]) with ordinality as candidate(handle, position)
    where public.is_handle_available(candidate.handle)
    order by candidate.position
    limit 1`);
  return row?.handle ?? null;
}
