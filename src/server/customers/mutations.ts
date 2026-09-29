import "server-only";

import { and, eq } from "drizzle-orm";

import { isCheckViolation, isForeignKeyViolation } from "@/db/errors";
import type { Tx } from "@/db/rls";
import { cases, customers, physios } from "@/db/schema";
import { type Locale, resolveLocale } from "@/i18n/config";

import { onCustomerArchived } from "./hooks";
import type { CaseInput, CustomerInput, Result } from "./schemas";

const ok = <T>(data: T) => ({ ok: true, data }) as const;
const fail = <E extends string>(error: E) => ({ ok: false, error }) as const;

const ownCustomer = (physioId: string, id: string) =>
  and(eq(customers.physioId, physioId), eq(customers.id, id));
const ownCase = (physioId: string, id: string) =>
  and(eq(cases.physioId, physioId), eq(cases.id, id));

export async function createCustomer(
  tx: Tx,
  physioId: string,
  input: CustomerInput,
): Promise<Result<{ id: string }, never>> {
  let locale: Locale;
  if (input.locale !== null) {
    locale = input.locale;
  } else {
    const [physio] = await tx
      .select({ locale: physios.locale })
      .from(physios)
      .where(eq(physios.id, physioId));
    locale = resolveLocale(physio?.locale);
  }
  const [row] = await tx
    .insert(customers)
    .values({ ...input, physioId, locale })
    .returning({ id: customers.id });
  return ok(row);
}

export async function updateCustomer(
  tx: Tx,
  physioId: string,
  id: string,
  input: CustomerInput,
): Promise<Result<null, "notFound">> {
  // A blank locale keeps the customer's current one (the column is not null).
  const { locale, ...rest } = input;
  const rows = await tx
    .update(customers)
    .set({ ...rest, ...(locale === null ? {} : { locale }) })
    .where(ownCustomer(physioId, id))
    .returning({ id: customers.id });
  return rows.length ? ok(null) : fail("notFound");
}

export async function setCustomerArchived(
  tx: Tx,
  physioId: string,
  id: string,
  archived: boolean,
): Promise<Result<null, "notFound">> {
  const rows = await tx
    .update(customers)
    .set({ archivedAt: archived ? new Date() : null })
    .where(ownCustomer(physioId, id))
    .returning({ id: customers.id });
  if (rows.length === 0) return fail("notFound");
  if (archived) await onCustomerArchived(tx, physioId, id);
  return ok(null);
}

export async function createCase(
  tx: Tx,
  physioId: string,
  customerId: string,
  input: CaseInput,
  today: string,
): Promise<Result<{ id: string }, "customerNotFound">> {
  const [customer] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(ownCustomer(physioId, customerId));
  if (!customer) return fail("customerNotFound");
  try {
    // A savepoint, so a constraint violation does not abort the caller's transaction.
    const [row] = await tx.transaction((savepoint) =>
      savepoint
        .insert(cases)
        .values({ ...input, physioId, customerId, openedOn: input.openedOn ?? today })
        .returning({ id: cases.id }),
    );
    return ok(row);
  } catch (error) {
    if (isForeignKeyViolation(error, "cases_customer_fk")) return fail("customerNotFound");
    throw error;
  }
}

export async function updateCase(
  tx: Tx,
  physioId: string,
  id: string,
  input: CaseInput,
): Promise<Result<null, "notFound" | "openedAfterClosed">> {
  // Content only: status and closedOn change through closeCase/reopenCase. A blank opening date
  // keeps the current one (the column is not null).
  const { openedOn, ...rest } = input;
  try {
    const rows = await tx.transaction((savepoint) =>
      savepoint
        .update(cases)
        .set({ ...rest, ...(openedOn === null ? {} : { openedOn }) })
        .where(ownCase(physioId, id))
        .returning({ id: cases.id }),
    );
    return rows.length ? ok(null) : fail("notFound");
  } catch (error) {
    if (isCheckViolation(error, "cases_closed_not_before_opened")) {
      return fail("openedAfterClosed");
    }
    throw error;
  }
}

export async function closeCase(
  tx: Tx,
  physioId: string,
  id: string,
  closedOn: string,
): Promise<Result<null, "notFound" | "notOpen" | "closedBeforeOpened">> {
  // One guarded UPDATE, so two concurrent closes cannot both succeed.
  try {
    const rows = await tx.transaction((savepoint) =>
      savepoint
        .update(cases)
        .set({ status: "closed", closedOn })
        .where(and(ownCase(physioId, id), eq(cases.status, "open")))
        .returning({ id: cases.id }),
    );
    if (rows.length) return ok(null);
  } catch (error) {
    if (isCheckViolation(error, "cases_closed_not_before_opened")) {
      return fail("closedBeforeOpened");
    }
    throw error;
  }
  const [existing] = await tx.select({ id: cases.id }).from(cases).where(ownCase(physioId, id));
  return fail(existing ? "notOpen" : "notFound");
}

export async function reopenCase(
  tx: Tx,
  physioId: string,
  id: string,
): Promise<Result<null, "notFound" | "notClosed">> {
  const rows = await tx
    .update(cases)
    .set({ status: "open", closedOn: null })
    .where(and(ownCase(physioId, id), eq(cases.status, "closed")))
    .returning({ id: cases.id });
  if (rows.length) return ok(null);
  const [existing] = await tx.select({ id: cases.id }).from(cases).where(ownCase(physioId, id));
  return fail(existing ? "notClosed" : "notFound");
}
