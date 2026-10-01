import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgPolicy,
  pgTable,
  smallint,
  text,
  unique,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { authenticatedRole, authUid } from "drizzle-orm/supabase";

// Relative imports: drizzle-kit loads the schema without the "@/" alias.
import { PHASE_LABEL_MAX } from "../../lib/phases";
import { ENTRY_LABEL_MAX, PLAN_NAME_MAX, PLAN_NOTES_MAX } from "../../lib/plans";
import { timestamps } from "./_columns";
import { customers } from "./customers";
import { routineStatusEnum } from "./enums";
import { physios } from "./physios";
import { routines } from "./routines";

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
 * A weekly plan (spec 06): a repeating Monday–Sunday template. customer_id is null only for
 * templates (spec 07). plans_case_fk (case must belong to the customer, ON DELETE SET NULL
 * (case_id)) lives in the custom migration.
 */
export const weeklyPlans = pgTable(
  "weekly_plans",
  {
    id: uuid().primaryKey().defaultRandom(),
    physioId: physioId(),
    customerId: uuid(),
    caseId: uuid(),
    name: text().notNull(),
    notes: text(),
    status: routineStatusEnum().notNull().default("draft"),
    version: integer().notNull().default(1),
    // Phases (spec 08). plans_previous_fk lives in the custom migration.
    phaseLabel: text(),
    startsOn: date({ mode: "string" }),
    endsOn: date({ mode: "string" }),
    previousId: uuid(),
    ...timestamps,
  },
  (t) => [
    unique("weekly_plans_physio_id_id_unique").on(t.physioId, t.id),
    // A NULL customer_id skips this FK (templates).
    foreignKey({
      name: "weekly_plans_customer_fk",
      columns: [t.physioId, t.customerId],
      foreignColumns: [customers.physioId, customers.id],
    }).onDelete("cascade"),
    index("weekly_plans_customer_idx").on(t.physioId, t.customerId, t.status),
    check(
      "weekly_plans_name_length",
      sql`char_length(${t.name}) between 1 and ${sql.raw(String(PLAN_NAME_MAX))}`,
    ),
    check(
      "weekly_plans_notes_length",
      sql`char_length(${t.notes}) <= ${sql.raw(String(PLAN_NOTES_MAX))}`,
    ),
    check("weekly_plans_version_positive", sql`${t.version} >= 1`),
    check(
      "weekly_plans_phase_label_length",
      sql`char_length(${t.phaseLabel}) between 1 and ${sql.raw(String(PHASE_LABEL_MAX))}`,
    ),
    check("weekly_plans_phase_window", sql`${t.endsOn} >= ${t.startsOn}`),
    check("weekly_plans_previous_not_self", sql`${t.previousId} <> ${t.id}`),
    index("weekly_plans_previous_idx").on(t.physioId, t.previousId),
    ownRows("weekly_plans_own", t.physioId),
  ],
);

/** One routine on one weekday of a plan. Several entries may share a routine (by reference). */
export const weeklyPlanEntries = pgTable(
  "weekly_plan_entries",
  {
    id: uuid().primaryKey().defaultRandom(),
    physioId: physioId(),
    weeklyPlanId: uuid().notNull(),
    weekday: smallint().notNull(),
    routineId: uuid().notNull(),
    position: integer().notNull(),
    label: text(),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: "weekly_plan_entries_plan_fk",
      columns: [t.physioId, t.weeklyPlanId],
      foreignColumns: [weeklyPlans.physioId, weeklyPlans.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "weekly_plan_entries_routine_fk",
      columns: [t.physioId, t.routineId],
      foreignColumns: [routines.physioId, routines.id],
    }).onDelete("restrict"),
    // Not unique: a reorder rewrites positions row by row.
    index("weekly_plan_entries_plan_idx").on(t.physioId, t.weeklyPlanId, t.weekday, t.position),
    index("weekly_plan_entries_routine_idx").on(t.physioId, t.routineId),
    check("weekly_plan_entries_weekday", sql`${t.weekday} between 1 and 7`),
    check("weekly_plan_entries_position", sql`${t.position} >= 0`),
    check(
      "weekly_plan_entries_label_length",
      sql`char_length(${t.label}) between 1 and ${sql.raw(String(ENTRY_LABEL_MAX))}`,
    ),
    ownRows("weekly_plan_entries_own", t.physioId),
  ],
);

export type WeeklyPlan = typeof weeklyPlans.$inferSelect;
export type WeeklyPlanEntry = typeof weeklyPlanEntries.$inferSelect;
