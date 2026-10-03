import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  numeric,
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

// Relative imports: drizzle-kit loads the schema without the "@/" alias.
import {
  LOG_COMMENT_MAX,
  PAIN_MAX,
  PAIN_MIN,
  RPE_MAX,
  RPE_MIN,
  WEIGHT_MAX,
} from "../../lib/session-logs";
import { timestamps } from "./_columns";
import { customers } from "./customers";
import { exercises } from "./library";
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

/**
 * What a patient reported for one exercise of a routine on one day. Written by patient-facing
 * code through the owner connection after link resolution; physios read it under RLS. The
 * share-link FK (ON DELETE SET NULL (share_link_id)) lives in the custom migration, and
 * `weekly_plan_entry_id` has no FK on purpose (see session_logs).
 */
export const exerciseLogs = pgTable(
  "exercise_logs",
  {
    id: uuid().primaryKey().defaultRandom(),
    physioId: uuid()
      .notNull()
      .references(() => physios.id, { onDelete: "cascade" }),
    customerId: uuid().notNull(),
    shareLinkId: uuid(),
    routineId: uuid().notNull(),
    weeklyPlanEntryId: uuid(),
    exerciseId: uuid().notNull(),
    performedOn: date({ mode: "string" }).notNull(),
    pain: smallint(),
    rpe: smallint(),
    weightKg: numeric({ precision: 5, scale: 1, mode: "number" }),
    comment: text(),
    seenByPhysioAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: "exercise_logs_customer_fk",
      columns: [t.physioId, t.customerId],
      foreignColumns: [customers.physioId, customers.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "exercise_logs_routine_fk",
      columns: [t.physioId, t.routineId],
      foreignColumns: [routines.physioId, routines.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "exercise_logs_exercise_fk",
      columns: [t.physioId, t.exerciseId],
      foreignColumns: [exercises.physioId, exercises.id],
    }).onDelete("cascade"),
    unique("exercise_logs_routine_entry_exercise_day_unique")
      .on(t.routineId, t.weeklyPlanEntryId, t.exerciseId, t.performedOn)
      .nullsNotDistinct(),
    index("exercise_logs_customer_idx").on(t.physioId, t.customerId, t.performedOn.desc()),
    index("exercise_logs_routine_idx").on(t.physioId, t.routineId),
    check(
      "exercise_logs_pain_range",
      sql`${t.pain} between ${sql.raw(String(PAIN_MIN))} and ${sql.raw(String(PAIN_MAX))}`,
    ),
    check(
      "exercise_logs_rpe_range",
      sql`${t.rpe} between ${sql.raw(String(RPE_MIN))} and ${sql.raw(String(RPE_MAX))}`,
    ),
    check(
      "exercise_logs_weight_range",
      sql`${t.weightKg} between 0 and ${sql.raw(String(WEIGHT_MAX))}`,
    ),
    check(
      "exercise_logs_comment_length",
      sql`char_length(${t.comment}) between 1 and ${sql.raw(String(LOG_COMMENT_MAX))}`,
    ),
    check(
      "exercise_logs_not_empty",
      sql`num_nonnulls(${t.pain}, ${t.rpe}, ${t.weightKg}, ${t.comment}) > 0`,
    ),
    ownRows("exercise_logs_own", t.physioId),
  ],
);

export type ExerciseLog = typeof exerciseLogs.$inferSelect;
export type NewExerciseLog = typeof exerciseLogs.$inferInsert;
