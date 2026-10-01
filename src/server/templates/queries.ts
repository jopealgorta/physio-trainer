import "server-only";

import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";

import type { Tx } from "@/db/rls";
import { cases, routines, weeklyPlans } from "@/db/schema";
import { customerName } from "@/lib/customers";
import { escapeLike } from "@/lib/sql-like";
import { listCustomers } from "@/server/customers/queries";

import { isUuid } from "./schemas";

/** A template in the "From template…" picker: `detail` is the exercise count (routine) or entry count (plan). */
export type TemplateOption = { id: string; name: string; detail: number };

const nameMatches = (name: SQL, q: string) =>
  sql`public.f_unaccent(lower(${name})) like public.f_unaccent(lower(${`%${escapeLike(q)}%`}))`;

/**
 * Active templates of one kind, newest first, narrowed by name (accent-insensitive). Routine
 * templates are the standalone ones: a template plan's own routines are edited through the plan.
 */
export async function listTemplates(
  tx: Tx,
  physioId: string,
  kind: "routine" | "plan",
  q: string,
  limit: number,
): Promise<TemplateOption[]> {
  if (kind === "routine") {
    return tx
      .select({
        id: routines.id,
        name: routines.name,
        // Written out with table aliases: Drizzle renders columns unqualified in a subquery.
        detail: sql<number>`(
          select count(*)::int from routine_items i
          where i.physio_id = routines.physio_id and i.routine_id = routines.id)`,
      })
      .from(routines)
      .where(
        and(
          eq(routines.physioId, physioId),
          eq(routines.isTemplate, true),
          eq(routines.isStandalone, true),
          eq(routines.status, "active"),
          q ? nameMatches(sql`${routines.name}`, q) : undefined,
        ),
      )
      .orderBy(desc(routines.updatedAt), asc(routines.id))
      .limit(limit);
  }
  return tx
    .select({
      id: weeklyPlans.id,
      name: weeklyPlans.name,
      detail: sql<number>`(
        select count(*)::int from weekly_plan_entries e
        where e.physio_id = weekly_plans.physio_id and e.weekly_plan_id = weekly_plans.id)`,
    })
    .from(weeklyPlans)
    .where(
      and(
        eq(weeklyPlans.physioId, physioId),
        eq(weeklyPlans.isTemplate, true),
        eq(weeklyPlans.status, "active"),
        q ? nameMatches(sql`${weeklyPlans.name}`, q) : undefined,
      ),
    )
    .orderBy(desc(weeklyPlans.updatedAt), asc(weeklyPlans.id))
    .limit(limit);
}

/** The name of the physio's template of this kind, or null (not theirs, not a template, bad id). */
export async function getTemplateName(
  tx: Tx,
  physioId: string,
  kind: "routine" | "plan",
  id: string,
): Promise<string | null> {
  if (!isUuid(id)) return null;
  const table = kind === "routine" ? routines : weeklyPlans;
  const [row] = await tx
    .select({ name: table.name })
    .from(table)
    .where(and(eq(table.physioId, physioId), eq(table.id, id), eq(table.isTemplate, true)));
  return row?.name ?? null;
}

/** A customer's cases for the assign dialog, open ones first. Empty for a foreign or bad id. */
export async function listCustomerCases(
  tx: Tx,
  physioId: string,
  customerId: string,
): Promise<{ id: string; title: string }[]> {
  if (!isUuid(customerId)) return [];
  return tx
    .select({ id: cases.id, title: cases.title })
    .from(cases)
    .where(and(eq(cases.physioId, physioId), eq(cases.customerId, customerId)))
    .orderBy(
      sql`case when ${cases.status} = 'open' then 0 else 1 end`,
      desc(cases.openedOn),
      asc(cases.id),
    );
}

/** The customers a template can be assigned to (not archived), by name. */
export async function listAssignableCustomers(
  tx: Tx,
  physioId: string,
): Promise<{ id: string; name: string }[]> {
  const { customers } = await listCustomers(tx, physioId, { q: "", sort: "name", archived: false });
  return customers.map((customer) => ({
    id: customer.id,
    name: customerName(customer.firstName, customer.lastName),
  }));
}
