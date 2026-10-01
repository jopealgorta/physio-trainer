import "server-only";

import { and, eq } from "drizzle-orm";

import { isForeignKeyViolation } from "@/db/errors";
import type { Tx } from "@/db/rls";
import { customers, visitNotes } from "@/db/schema";

import { isUuid, type Result, type VisitNoteInput } from "./schemas";

const ok = <T>(data: T) => ({ ok: true, data }) as const;
const fail = <E extends string>(error: E) => ({ ok: false, error }) as const;

const ownNote = (physioId: string, id: string) =>
  and(eq(visitNotes.physioId, physioId), eq(visitNotes.id, id));

export async function createVisitNote(
  tx: Tx,
  physioId: string,
  customerId: string,
  input: VisitNoteInput,
  today: string,
): Promise<Result<{ id: string }, "customerNotFound" | "caseNotFound">> {
  if (!isUuid(customerId)) return fail("customerNotFound");
  const [customer] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.physioId, physioId), eq(customers.id, customerId)));
  if (!customer) return fail("customerNotFound");
  try {
    // A savepoint, so a constraint violation does not abort the caller's transaction.
    const [row] = await tx.transaction((savepoint) =>
      savepoint
        .insert(visitNotes)
        .values({ ...input, physioId, customerId, visitedOn: input.visitedOn ?? today })
        .returning({ id: visitNotes.id }),
    );
    return ok(row);
  } catch (error) {
    if (isForeignKeyViolation(error, "visit_notes_case_fk")) return fail("caseNotFound");
    throw error;
  }
}

export async function updateVisitNote(
  tx: Tx,
  physioId: string,
  id: string,
  input: VisitNoteInput,
): Promise<Result<null, "notFound" | "caseNotFound">> {
  if (!isUuid(id)) return fail("notFound");
  // A blank date keeps the current one (the column is not null).
  const { visitedOn, ...rest } = input;
  try {
    const rows = await tx.transaction((savepoint) =>
      savepoint
        .update(visitNotes)
        .set({ ...rest, ...(visitedOn === null ? {} : { visitedOn }) })
        .where(ownNote(physioId, id))
        .returning({ id: visitNotes.id }),
    );
    return rows.length ? ok(null) : fail("notFound");
  } catch (error) {
    if (isForeignKeyViolation(error, "visit_notes_case_fk")) return fail("caseNotFound");
    throw error;
  }
}

export async function deleteVisitNote(
  tx: Tx,
  physioId: string,
  id: string,
): Promise<Result<null, "notFound">> {
  if (!isUuid(id)) return fail("notFound");
  const rows = await tx
    .delete(visitNotes)
    .where(ownNote(physioId, id))
    .returning({ id: visitNotes.id });
  return rows.length ? ok(null) : fail("notFound");
}
