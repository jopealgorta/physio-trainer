import { sql } from "drizzle-orm";
import {
  boolean,
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
import { PRESCRIPTION_LIMITS } from "../../lib/prescription";
import { ROUTINE_NAME_MAX, ROUTINE_NOTES_MAX, SECTION_NAME_MAX } from "../../lib/routines";
import { timestamps } from "./_columns";
import {
  itemPrescriptionChecks,
  itemPrescriptionColumns,
  setPrescriptionChecks,
  setPrescriptionColumns,
} from "./_prescription";
import { customers } from "./customers";
import { routineStatusEnum } from "./enums";
import { exercises } from "./library";
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
 * A routine (spec 05). References are composite (physio_id, …) so a row can never point at
 * another physio's row (FK checks bypass RLS). routines_case_fk (case must belong to the
 * customer, ON DELETE SET NULL (case_id)) and routines_source_template_fk (provenance of a
 * copy, ON DELETE SET NULL (source_template_id)) live in the custom migrations.
 * customer_id is null only for templates (spec 07).
 */
export const routines = pgTable(
  "routines",
  {
    id: uuid().primaryKey().defaultRandom(),
    physioId: physioId(),
    customerId: uuid(),
    caseId: uuid(),
    name: text().notNull(),
    notes: text(),
    isTemplate: boolean().notNull().default(false),
    sourceTemplateId: uuid(),
    isStandalone: boolean().notNull().default(true),
    sessionsPerWeek: smallint(),
    sessionsPerDay: smallint(),
    status: routineStatusEnum().notNull().default("draft"),
    version: integer().notNull().default(1),
    // Phases (spec 08). routines_previous_fk (ON DELETE SET NULL (previous_id)) lives in the
    // custom migration; the copy mutation only links a clone to its own source.
    phaseLabel: text(),
    startsOn: date({ mode: "string" }),
    endsOn: date({ mode: "string" }),
    previousId: uuid(),
    ...timestamps,
  },
  (t) => [
    unique("routines_physio_id_id_unique").on(t.physioId, t.id),
    // A NULL customer_id skips this FK (templates).
    foreignKey({
      name: "routines_customer_fk",
      columns: [t.physioId, t.customerId],
      foreignColumns: [customers.physioId, customers.id],
    }).onDelete("cascade"),
    index("routines_customer_idx").on(t.physioId, t.customerId, t.status),
    index("routines_template_idx").on(t.physioId, t.isTemplate, t.status),
    check("routines_template_customer", sql`${t.isTemplate} = (${t.customerId} is null)`),
    check("routines_template_not_draft", sql`not ${t.isTemplate} or ${t.status} <> 'draft'`),
    check("routines_case_needs_customer", sql`${t.caseId} is null or ${t.customerId} is not null`),
    check(
      "routines_name_length",
      sql`char_length(${t.name}) between 1 and ${sql.raw(String(ROUTINE_NAME_MAX))}`,
    ),
    check(
      "routines_notes_length",
      sql`char_length(${t.notes}) <= ${sql.raw(String(ROUTINE_NOTES_MAX))}`,
    ),
    check("routines_sessions_per_week", sql`${t.sessionsPerWeek} between 1 and 14`),
    check("routines_sessions_per_day", sql`${t.sessionsPerDay} between 1 and 5`),
    check("routines_version_positive", sql`${t.version} >= 1`),
    check(
      "routines_phase_label_length",
      sql`char_length(${t.phaseLabel}) between 1 and ${sql.raw(String(PHASE_LABEL_MAX))}`,
    ),
    check("routines_phase_window", sql`${t.endsOn} >= ${t.startsOn}`),
    check("routines_previous_not_self", sql`${t.previousId} <> ${t.id}`),
    index("routines_previous_idx").on(t.physioId, t.previousId),
    ownRows("routines_own", t.physioId),
  ],
);

/** A superset: consecutive items of a routine sharing one rest period. */
export const routineGroups = pgTable(
  "routine_groups",
  {
    id: uuid().primaryKey().defaultRandom(),
    physioId: physioId(),
    routineId: uuid().notNull(),
    restSeconds: smallint(),
    ...timestamps,
  },
  (t) => [
    unique("routine_groups_physio_routine_id_unique").on(t.physioId, t.routineId, t.id),
    foreignKey({
      name: "routine_groups_routine_fk",
      columns: [t.physioId, t.routineId],
      foreignColumns: [routines.physioId, routines.id],
    }).onDelete("cascade"),
    index("routine_groups_routine_idx").on(t.physioId, t.routineId),
    check(
      "routine_groups_rest_seconds_range",
      sql`${t.restSeconds} between ${sql.raw(String(PRESCRIPTION_LIMITS.restSeconds.min))} and ${sql.raw(String(PRESCRIPTION_LIMITS.restSeconds.max))}`,
    ),
    ownRows("routine_groups_own", t.physioId),
  ],
);

/**
 * A named, ordered part of a routine (spec 22): "Warm-up", "Main", ... Items point at one via
 * routine_items_section_fk. The set_updated_at trigger and the backfill live in the custom
 * migration.
 */
export const routineSections = pgTable(
  "routine_sections",
  {
    id: uuid().primaryKey().defaultRandom(),
    physioId: physioId(),
    routineId: uuid().notNull(),
    name: text().notNull(),
    position: integer().notNull(),
    ...timestamps,
  },
  (t) => [
    unique("routine_sections_physio_routine_id_unique").on(t.physioId, t.routineId, t.id),
    unique("routine_sections_position_unique").on(t.physioId, t.routineId, t.position),
    foreignKey({
      name: "routine_sections_routine_fk",
      columns: [t.physioId, t.routineId],
      foreignColumns: [routines.physioId, routines.id],
    }).onDelete("cascade"),
    index("routine_sections_routine_idx").on(t.physioId, t.routineId),
    check("routine_sections_position", sql`${t.position} >= 0`),
    check(
      "routine_sections_name_length",
      sql`char_length(${t.name}) between 1 and ${sql.raw(String(SECTION_NAME_MAX))}`,
    ),
    ownRows("routine_sections_own", t.physioId),
  ],
);

/** An exercise in a routine, ordered by position, optionally inside a superset group. */
export const routineItems = pgTable(
  "routine_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    physioId: physioId(),
    routineId: uuid().notNull(),
    exerciseId: uuid().notNull(),
    position: integer().notNull(),
    groupId: uuid(),
    // Every item belongs to a section of its routine (spec 22; required since the contract chore).
    sectionId: uuid().notNull(),
    ...itemPrescriptionColumns(),
    ...timestamps,
  },
  (t) => [
    unique("routine_items_physio_id_id_unique").on(t.physioId, t.id),
    unique("routine_items_position_unique").on(t.physioId, t.routineId, t.position),
    foreignKey({
      name: "routine_items_routine_fk",
      columns: [t.physioId, t.routineId],
      foreignColumns: [routines.physioId, routines.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "routine_items_exercise_fk",
      columns: [t.physioId, t.exerciseId],
      foreignColumns: [exercises.physioId, exercises.id],
    }).onDelete("restrict"),
    // A NULL group_id skips this FK; otherwise the group must belong to the same routine.
    foreignKey({
      name: "routine_items_group_fk",
      columns: [t.physioId, t.routineId, t.groupId],
      foreignColumns: [routineGroups.physioId, routineGroups.routineId, routineGroups.id],
    }),
    // The section must belong to the same routine.
    foreignKey({
      name: "routine_items_section_fk",
      columns: [t.physioId, t.routineId, t.sectionId],
      foreignColumns: [routineSections.physioId, routineSections.routineId, routineSections.id],
    }),
    index("routine_items_routine_idx").on(t.physioId, t.routineId),
    check("routine_items_position", sql`${t.position} >= 0`),
    check("routine_items_group_no_rest", sql`${t.groupId} is null or ${t.restSeconds} is null`),
    ...itemPrescriptionChecks("routine_items", t),
    ownRows("routine_items_own", t.physioId),
  ],
);

/** One set of a routine item (reps or duration, optional load). */
export const routineItemSets = pgTable(
  "routine_item_sets",
  {
    id: uuid().primaryKey().defaultRandom(),
    physioId: physioId(),
    routineItemId: uuid().notNull(),
    position: integer().notNull(),
    ...setPrescriptionColumns(),
    ...timestamps,
  },
  (t) => [
    unique("routine_item_sets_position_unique").on(t.physioId, t.routineItemId, t.position),
    foreignKey({
      name: "routine_item_sets_item_fk",
      columns: [t.physioId, t.routineItemId],
      foreignColumns: [routineItems.physioId, routineItems.id],
    }).onDelete("cascade"),
    check("routine_item_sets_position", sql`${t.position} between 0 and 19`),
    ...setPrescriptionChecks("routine_item_sets", t),
    ownRows("routine_item_sets_own", t.physioId),
  ],
);

export type Routine = typeof routines.$inferSelect;
export type RoutineSection = typeof routineSections.$inferSelect;
export type RoutineGroup = typeof routineGroups.$inferSelect;
export type RoutineItem = typeof routineItems.$inferSelect;
export type RoutineItemSet = typeof routineItemSets.$inferSelect;
