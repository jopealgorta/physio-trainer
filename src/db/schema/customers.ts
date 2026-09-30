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
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { authenticatedRole, authUid } from "drizzle-orm/supabase";

// Relative import: drizzle-kit loads the schema without the "@/" alias.
import {
  ACTIVITY_MAX,
  CASE_NOTES_MAX,
  CASE_TITLE_MAX,
  DIAGNOSIS_MAX,
  EMAIL_MAX,
  FIRST_NAME_MAX,
  GOALS_MAX,
  LAST_NAME_MAX,
  MEDICAL_HISTORY_MAX,
  OCCUPATION_MAX,
  PHONE_MAX,
  PRECAUTIONS_MAX,
} from "../../lib/customers";
import { timestamps } from "./_columns";
import { bodyAreaEnum, bodySideEnum, caseStatusEnum, customerSexEnum } from "./enums";
import { physios } from "./physios";

/** Tenancy rule 1: a physio reads and writes only their own rows. */
const ownRows = (name: string, physioId: AnyPgColumn) =>
  pgPolicy(name, {
    for: "all",
    to: authenticatedRole,
    using: sql`${physioId} = ${authUid}`,
    withCheck: sql`${physioId} = ${authUid}`,
  });

const physioId = () =>
  uuid()
    .notNull()
    .references(() => physios.id, { onDelete: "cascade" });

/**
 * A physio's customer (patient). Archived rather than deleted from the UI; hard delete cascades
 * to cases. The accent-insensitive name search index lives in the custom migration.
 */
export const customers = pgTable(
  "customers",
  {
    id: uuid().primaryKey().defaultRandom(),
    physioId: physioId(),
    firstName: text().notNull(),
    lastName: text(),
    email: text(),
    phone: text(),
    dateOfBirth: date({ mode: "string" }),
    sex: customerSexEnum(),
    occupation: text(),
    activity: text(),
    medicalHistory: text(),
    locale: text().notNull(),
    archivedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique("customers_physio_id_id_unique").on(t.physioId, t.id),
    index("customers_physio_id_archived_at_idx").on(t.physioId, t.archivedAt),
    check(
      "customers_first_name_length",
      sql`char_length(${t.firstName}) between 1 and ${sql.raw(String(FIRST_NAME_MAX))}`,
    ),
    check(
      "customers_last_name_length",
      sql`char_length(${t.lastName}) <= ${sql.raw(String(LAST_NAME_MAX))}`,
    ),
    check("customers_email_length", sql`char_length(${t.email}) <= ${sql.raw(String(EMAIL_MAX))}`),
    check("customers_phone_length", sql`char_length(${t.phone}) <= ${sql.raw(String(PHONE_MAX))}`),
    check(
      "customers_occupation_length",
      sql`char_length(${t.occupation}) <= ${sql.raw(String(OCCUPATION_MAX))}`,
    ),
    check(
      "customers_activity_length",
      sql`char_length(${t.activity}) <= ${sql.raw(String(ACTIVITY_MAX))}`,
    ),
    check(
      "customers_medical_history_length",
      sql`char_length(${t.medicalHistory}) <= ${sql.raw(String(MEDICAL_HISTORY_MAX))}`,
    ),
    ownRows("customers_own", t.physioId),
  ],
);

/**
 * A clinical case (episode of care) for a customer. The composite FK (physio_id, customer_id)
 * means a case can never point at another physio's customer (FK checks bypass RLS).
 */
export const cases = pgTable(
  "cases",
  {
    id: uuid().primaryKey().defaultRandom(),
    physioId: physioId(),
    customerId: uuid().notNull(),
    title: text().notNull(),
    diagnosis: text(),
    bodyArea: bodyAreaEnum(),
    side: bodySideEnum(),
    injuryOn: date({ mode: "string" }),
    surgeryOn: date({ mode: "string" }),
    precautions: text(),
    goals: text(),
    initialPain: smallint(),
    notes: text(),
    status: caseStatusEnum().notNull().default("open"),
    openedOn: date({ mode: "string" })
      .notNull()
      .default(sql`current_date`),
    closedOn: date({ mode: "string" }),
    ...timestamps,
  },
  (t) => [
    // Target of routines_case_fk (a routine's case must belong to the routine's customer).
    unique("cases_physio_customer_id_unique").on(t.physioId, t.customerId, t.id),
    foreignKey({
      name: "cases_customer_fk",
      columns: [t.physioId, t.customerId],
      foreignColumns: [customers.physioId, customers.id],
    }).onDelete("cascade"),
    index("cases_customer_id_idx").on(t.physioId, t.customerId, t.status),
    check(
      "cases_title_length",
      sql`char_length(${t.title}) between 1 and ${sql.raw(String(CASE_TITLE_MAX))}`,
    ),
    check(
      "cases_diagnosis_length",
      sql`char_length(${t.diagnosis}) <= ${sql.raw(String(DIAGNOSIS_MAX))}`,
    ),
    check(
      "cases_precautions_length",
      sql`char_length(${t.precautions}) <= ${sql.raw(String(PRECAUTIONS_MAX))}`,
    ),
    check("cases_goals_length", sql`char_length(${t.goals}) <= ${sql.raw(String(GOALS_MAX))}`),
    check("cases_notes_length", sql`char_length(${t.notes}) <= ${sql.raw(String(CASE_NOTES_MAX))}`),
    check("cases_initial_pain_range", sql`${t.initialPain} between 0 and 10`),
    check("cases_area_not_full_body", sql`${t.bodyArea} <> 'full_body'`),
    check("cases_side_needs_area", sql`${t.side} is null or ${t.bodyArea} is not null`),
    check(
      "cases_closed_on_matches_status",
      sql`(${t.status} = 'closed') = (${t.closedOn} is not null)`,
    ),
    check("cases_closed_not_before_opened", sql`${t.closedOn} >= ${t.openedOn}`),
    ownRows("cases_own", t.physioId),
  ],
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type Case = typeof cases.$inferSelect;
export type NewCase = typeof cases.$inferInsert;
