import "server-only";

import { and, desc, eq } from "drizzle-orm";

import type { Tx } from "@/db/rls";
import { visitNotes, type VisitNote } from "@/db/schema";
import type { NotesFilters } from "@/lib/visit-notes";

import { isUuid } from "./schemas";

const newestFirst = [desc(visitNotes.visitedOn), desc(visitNotes.createdAt), desc(visitNotes.id)];

/** A customer's notes, newest visit first; `hasMore` is true when more than `limit` exist. */
export async function listVisitNotes(
  tx: Tx,
  physioId: string,
  customerId: string,
  { caseId, limit }: NotesFilters,
): Promise<{ notes: VisitNote[]; hasMore: boolean }> {
  if (!isUuid(customerId)) return { notes: [], hasMore: false };
  const rows = await tx
    .select()
    .from(visitNotes)
    .where(
      and(
        eq(visitNotes.physioId, physioId),
        eq(visitNotes.customerId, customerId),
        caseId ? eq(visitNotes.caseId, caseId) : undefined,
      ),
    )
    .orderBy(...newestFirst)
    .limit(limit + 1);
  return { notes: rows.slice(0, limit), hasMore: rows.length > limit };
}

/** The customer's most recent note, or null. */
export async function latestVisitNote(
  tx: Tx,
  physioId: string,
  customerId: string,
): Promise<VisitNote | null> {
  if (!isUuid(customerId)) return null;
  const [row] = await tx
    .select()
    .from(visitNotes)
    .where(and(eq(visitNotes.physioId, physioId), eq(visitNotes.customerId, customerId)))
    .orderBy(...newestFirst)
    .limit(1);
  return row ?? null;
}
