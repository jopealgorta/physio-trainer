import "server-only";

import { and, eq, sql } from "drizzle-orm";

import type { Tx } from "@/db/rls";
import {
  cases,
  customers,
  routineItems,
  routines,
  weeklyPlanEntries,
  weeklyPlans,
} from "@/db/schema";
import { copyPlan } from "@/server/plans/mutations";
import { copyRoutine } from "@/server/routines/mutations";

import {
  isUuid,
  type AssignTemplateInput,
  type CreateTemplateInput,
  type DuplicateTemplateInput,
  type Result,
  type SaveAsTemplateInput,
  type TemplateError,
} from "./schemas";

const ok = <T>(data: T) => ({ ok: true, data }) as const;
const fail = <E extends string>(error: E) => ({ ok: false, error }) as const;

type TemplateResult = Result<{ id: string }, TemplateError>;

const tableFor = (kind: "routine" | "plan") => (kind === "routine" ? routines : weeklyPlans);

/**
 * The physio's row of this kind (template or not), or null. Malformed ids never reach SQL.
 * `lock` takes the row `for share` (saves lock it `for update`), so what the caller then checks
 * is still true when it copies. `standalone` is false for a routine that only lives in a plan.
 */
async function findRow(
  tx: Tx,
  physioId: string,
  kind: "routine" | "plan",
  id: string,
  { lock = false }: { lock?: boolean } = {},
) {
  if (!isUuid(id)) return null;
  const table = tableFor(kind);
  const query = tx
    .select({
      id: table.id,
      isTemplate: table.isTemplate,
      status: table.status,
      standalone: kind === "routine" ? routines.isStandalone : sql<boolean>`true`,
    })
    .from(table)
    .where(and(eq(table.physioId, physioId), eq(table.id, id)));
  const [row] = await (lock ? query.for("share") : query);
  return row ?? null;
}

/**
 * Whether the row is a template that can be assigned or duplicated on its own: a plan template,
 * or a standalone routine template. A template plan's own routines are edited through the plan.
 */
const isUsableTemplate = (row: Awaited<ReturnType<typeof findRow>>) =>
  row !== null && row.isTemplate && row.standalone;

/** An empty, active template that belongs to no customer. Routine templates are standalone. */
export async function createTemplate(
  tx: Tx,
  physioId: string,
  input: CreateTemplateInput,
): Promise<TemplateResult> {
  if (input.kind === "routine") {
    const [row] = await tx
      .insert(routines)
      .values({
        physioId,
        customerId: null,
        name: input.name,
        isTemplate: true,
        isStandalone: true,
        status: "active",
      })
      .returning({ id: routines.id });
    return ok(row);
  }
  const [row] = await tx
    .insert(weeklyPlans)
    .values({ physioId, customerId: null, name: input.name, isTemplate: true, status: "active" })
    .returning({ id: weeklyPlans.id });
  return ok(row);
}

/**
 * Copies a customer routine/plan (notes and labels verbatim, spec 07 answer 3) into a template:
 * no customer, no case, no source link. Only non-templates qualify (`source_template_id` is only
 * ever set from a template). A template's `is_template` never changes, so checking it before the
 * copy locks the source is safe.
 */
export async function saveAsTemplate(
  tx: Tx,
  physioId: string,
  input: SaveAsTemplateInput,
): Promise<TemplateResult> {
  const source = await findRow(tx, physioId, input.kind, input.sourceId);
  if (!source) return fail("notFound");
  if (source.isTemplate) return fail("alreadyTemplate");

  const copy =
    input.kind === "routine"
      ? await copyRoutine(tx, physioId, source.id, () => ({
          name: input.name,
          customerId: null,
          caseId: null,
          isStandalone: true,
          status: "active",
          isTemplate: true,
          sourceTemplateId: null,
        }))
      : await copyPlan(tx, physioId, source.id, {
          name: input.name,
          customerId: null,
          caseId: null,
          status: "active",
          isTemplate: true,
          routineStatus: "active",
          linkSource: false,
        });
  return copy.ok ? ok(copy.data) : fail("notFound");
}

/** How many routines the template (a routine, or every routine of a plan) has no exercises in. */
async function emptyRoutineCount(tx: Tx, physioId: string, kind: "routine" | "plan", id: string) {
  const routineIds =
    kind === "routine"
      ? sql`${id}::uuid`
      : sql`(select routine_id from weekly_plan_entries where physio_id = ${physioId} and weekly_plan_id = ${id})`;
  const [{ empty }] = await tx
    .select({ empty: sql<number>`count(*)::int` })
    .from(routines)
    .where(
      and(
        eq(routines.physioId, physioId),
        sql`${routines.id} in (${routineIds})`,
        sql`not exists (select 1 from ${routineItems} where ${routineItems.physioId} = ${routines.physioId} and ${routineItems.routineId} = ${routines.id})`,
      ),
    );
  return empty;
}

/**
 * Deep-copies a template to a customer (independent copy, spec 07 rule 1) and records the
 * template as the copy's source. Validation order: template, template archived, customer,
 * customer archived, case, then the content a chosen `active` status needs.
 */
export async function assignTemplate(
  tx: Tx,
  physioId: string,
  input: AssignTemplateInput,
): Promise<TemplateResult> {
  // Locked before anything is checked: a concurrent save (archive, last exercise removed) either
  // lands first and is seen here, or waits until the copy is done.
  const template = await findRow(tx, physioId, input.kind, input.templateId, { lock: true });
  if (!template || !isUsableTemplate(template)) return fail("templateNotFound");
  if (template.status === "archived") return fail("templateArchived");
  if (input.kind === "plan") {
    // The routines' items are checked below and copied after: hold them still in between.
    await tx
      .select({ id: routines.id })
      .from(routines)
      .where(
        and(
          eq(routines.physioId, physioId),
          sql`${routines.id} in (select routine_id from weekly_plan_entries where physio_id = ${physioId} and weekly_plan_id = ${template.id})`,
        ),
      )
      .for("share");
  }

  if (!isUuid(input.customerId)) return fail("customerNotFound");
  const [customer] = await tx
    .select({ archivedAt: customers.archivedAt })
    .from(customers)
    .where(and(eq(customers.physioId, physioId), eq(customers.id, input.customerId)));
  if (!customer) return fail("customerNotFound");
  if (customer.archivedAt !== null) return fail("customerArchived");

  if (input.caseId !== null) {
    if (!isUuid(input.caseId)) return fail("caseNotFound");
    const [kase] = await tx
      .select({ id: cases.id })
      .from(cases)
      .where(
        and(
          eq(cases.physioId, physioId),
          eq(cases.id, input.caseId),
          eq(cases.customerId, input.customerId),
        ),
      );
    if (!kase) return fail("caseNotFound");
  }

  if (input.status === "active") {
    if (input.kind === "plan") {
      const [{ entries }] = await tx
        .select({ entries: sql<number>`count(*)::int` })
        .from(weeklyPlanEntries)
        .where(
          and(
            eq(weeklyPlanEntries.physioId, physioId),
            eq(weeklyPlanEntries.weeklyPlanId, template.id),
          ),
        );
      if (entries === 0) return fail("needsEntries");
    }
    if ((await emptyRoutineCount(tx, physioId, input.kind, template.id)) > 0) {
      return fail("needsItems");
    }
  }

  const copy =
    input.kind === "routine"
      ? await copyRoutine(tx, physioId, template.id, (source) => ({
          name: input.name,
          customerId: input.customerId,
          caseId: input.caseId,
          isStandalone: true,
          status: input.status,
          isTemplate: false,
          sourceTemplateId: source.id,
        }))
      : await copyPlan(tx, physioId, template.id, {
          name: input.name,
          customerId: input.customerId,
          caseId: input.caseId,
          status: input.status,
          isTemplate: false,
          routineStatus: input.status,
          linkSource: true,
        });
  return copy.ok ? ok(copy.data) : fail("templateNotFound");
}

/**
 * Template to template: an independent copy that keeps the source's status (a plan's routines
 * take the plan's status) and records no provenance.
 */
export async function duplicateTemplate(
  tx: Tx,
  physioId: string,
  input: DuplicateTemplateInput,
): Promise<TemplateResult> {
  const template = await findRow(tx, physioId, input.kind, input.templateId, { lock: true });
  if (!template || !isUsableTemplate(template)) return fail("templateNotFound");

  const copy =
    input.kind === "routine"
      ? await copyRoutine(tx, physioId, template.id, (source) => ({
          name: input.name,
          customerId: null,
          caseId: null,
          isStandalone: true,
          status: source.status,
          isTemplate: true,
          sourceTemplateId: null,
        }))
      : await copyPlan(tx, physioId, template.id, {
          name: input.name,
          customerId: null,
          caseId: null,
          status: template.status,
          isTemplate: true,
          routineStatus: template.status,
          linkSource: false,
        });
  return copy.ok ? ok(copy.data) : fail("templateNotFound");
}
