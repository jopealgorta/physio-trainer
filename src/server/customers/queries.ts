import "server-only";

import { and, asc, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";

import type { Tx } from "@/db/rls";
import { cases, customers, type Case, type Customer } from "@/db/schema";
import type { BodyArea, BodySide } from "@/lib/body-areas";
import type { CustomerFilters } from "@/lib/customer-params";
import { escapeLike } from "@/lib/sql-like";

import { isUuid } from "./schemas";

export const LIST_LIMIT = 500;

/** Must match the trigram index expression in the customers migration to stay indexable. */
const fullName = sql`(${customers.firstName} || ' ' || coalesce(${customers.lastName}, ''))`;
const searchKey = sql`public.f_unaccent(lower(${fullName}))`;

export type CustomerSummary = {
  id: string;
  firstName: string;
  lastName: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  activeCase: { title: string; bodyArea: BodyArea | null; side: BodySide | null } | null;
};

export async function listCustomers(
  tx: Tx,
  physioId: string,
  filters: CustomerFilters,
  limit = LIST_LIMIT,
): Promise<{ customers: CustomerSummary[]; truncated: boolean }> {
  const conditions: SQL[] = [
    eq(customers.physioId, physioId),
    filters.archived ? isNotNull(customers.archivedAt) : isNull(customers.archivedAt),
  ];
  if (filters.q) {
    conditions.push(
      sql`${searchKey} like public.f_unaccent(lower(${`%${escapeLike(filters.q)}%`}))`,
    );
  }

  const rows = await tx
    .select({
      id: customers.id,
      firstName: customers.firstName,
      lastName: customers.lastName,
      archivedAt: customers.archivedAt,
      createdAt: customers.createdAt,
    })
    .from(customers)
    .where(and(...conditions))
    .orderBy(
      ...(filters.sort === "recent"
        ? [desc(customers.createdAt), asc(customers.id)]
        : [
            sql`public.f_unaccent(lower(${customers.firstName}))`,
            sql`public.f_unaccent(lower(coalesce(${customers.lastName}, '')))`,
            asc(customers.id),
          ]),
    )
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const activeCases = new Map<string, CustomerSummary["activeCase"]>();
  if (page.length > 0) {
    const open = await tx
      .select({
        customerId: cases.customerId,
        title: cases.title,
        bodyArea: cases.bodyArea,
        side: cases.side,
      })
      .from(cases)
      .where(
        and(
          eq(cases.physioId, physioId),
          inArray(
            cases.customerId,
            page.map((row) => row.id),
          ),
          eq(cases.status, "open"),
        ),
      )
      .orderBy(desc(cases.openedOn), desc(cases.createdAt));
    for (const { customerId, ...activeCase } of open) {
      if (!activeCases.has(customerId)) activeCases.set(customerId, activeCase);
    }
  }

  return {
    customers: page.map((row) => ({ ...row, activeCase: activeCases.get(row.id) ?? null })),
    truncated: rows.length > limit,
  };
}

/** Whether the physio owns any customer at all, archived included. */
export async function hasAnyCustomers(tx: Tx, physioId: string): Promise<boolean> {
  const rows = await tx.execute<{ found: boolean }>(sql`
    select exists(select 1 from ${customers} where ${customers.physioId} = ${physioId}) as found`);
  return rows[0]?.found === true;
}

export type CustomerDetail = Customer & { cases: Case[] };

export async function getCustomer(
  tx: Tx,
  physioId: string,
  id: string,
): Promise<CustomerDetail | null> {
  if (!isUuid(id)) return null;
  const [customer] = await tx
    .select()
    .from(customers)
    .where(and(eq(customers.physioId, physioId), eq(customers.id, id)));
  if (!customer) return null;
  const customerCases = await tx
    .select()
    .from(cases)
    .where(and(eq(cases.physioId, physioId), eq(cases.customerId, id)))
    .orderBy(
      sql`case when ${cases.status} = 'open' then 0 else 1 end`,
      desc(cases.openedOn),
      sql`${cases.closedOn} desc nulls last`,
      desc(cases.createdAt),
    );
  return { ...customer, cases: customerCases };
}
