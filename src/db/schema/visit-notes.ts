import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  pgPolicy,
  pgTable,
  smallint,
  text,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { authenticatedRole, authUid } from "drizzle-orm/supabase";

// Relative imports: drizzle-kit loads the schema without the "@/" alias.
import { SOAP_MAX } from "../../lib/visit-notes";
import { timestamps } from "./_columns";
import { customers } from "./customers";
import { physios } from "./physios";

/** Tenancy rule 1: a physio reads and writes only their own rows. */
const ownRows = (name: string, physioId: AnyPgColumn) =>
  pgPolicy(name, {
    for: "all",
    to: authenticatedRole,
    using: sql`${physioId} = ${authUid}`,
    withCheck: sql`${physioId} = ${authUid}`,
  });

/**
 * A private SOAP note for one visit (spec 16). Never read by patient-facing code or exports.
 * visit_notes_case_fk (the case must belong to the note's customer, ON DELETE SET NULL
 * (case_id)) lives in the custom migration.
 */
export const visitNotes = pgTable(
  "visit_notes",
  {
    id: uuid().primaryKey().defaultRandom(),
    physioId: uuid()
      .notNull()
      .references(() => physios.id, { onDelete: "cascade" }),
    customerId: uuid().notNull(),
    caseId: uuid(),
    visitedOn: date({ mode: "string" })
      .notNull()
      .default(sql`current_date`),
    subjective: text(),
    objective: text(),
    assessment: text(),
    plan: text(),
    pain: smallint(),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: "visit_notes_customer_fk",
      columns: [t.physioId, t.customerId],
      foreignColumns: [customers.physioId, customers.id],
    }).onDelete("cascade"),
    index("visit_notes_customer_idx").on(t.physioId, t.customerId, t.visitedOn.desc()),
    check(
      "visit_notes_subjective_length",
      sql`char_length(${t.subjective}) <= ${sql.raw(String(SOAP_MAX))}`,
    ),
    check(
      "visit_notes_objective_length",
      sql`char_length(${t.objective}) <= ${sql.raw(String(SOAP_MAX))}`,
    ),
    check(
      "visit_notes_assessment_length",
      sql`char_length(${t.assessment}) <= ${sql.raw(String(SOAP_MAX))}`,
    ),
    check("visit_notes_plan_length", sql`char_length(${t.plan}) <= ${sql.raw(String(SOAP_MAX))}`),
    check("visit_notes_pain_range", sql`${t.pain} between 0 and 10`),
    check(
      "visit_notes_has_content",
      sql`btrim(coalesce(${t.subjective}, '') || coalesce(${t.objective}, '') || coalesce(${t.assessment}, '') || coalesce(${t.plan}, '')) <> ''`,
    ),
    ownRows("visit_notes_own", t.physioId),
  ],
);

export type VisitNote = typeof visitNotes.$inferSelect;
export type NewVisitNote = typeof visitNotes.$inferInsert;
