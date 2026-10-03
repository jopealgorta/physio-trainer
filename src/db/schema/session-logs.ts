import { sql } from "drizzle-orm";
import {
  boolean,
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

// Relative imports: drizzle-kit loads the schema without the "@/" alias.
import { LOG_COMMENT_MAX, PAIN_MAX, PAIN_MIN, RPE_MAX, RPE_MIN } from "../../lib/session-logs";
import { timestamps } from "./_columns";
import { customers } from "./customers";
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
 * What a patient reported for one routine on one day (spec 13). Written by patient-facing code
 * through the owner connection after link resolution; physios read it under RLS.
 * session_logs_share_link_fk (ON DELETE SET NULL (share_link_id)) lives in the custom migration.
 * `weekly_plan_entry_id` has no FK on purpose: SET NULL could collide with the unique key (the
 * same routine logged standalone that day) and block a physio from deleting a plan entry, so a
 * deleted entry just leaves the id dangling.
 */
export const sessionLogs = pgTable(
  "session_logs",
  {
    id: uuid().primaryKey().defaultRandom(),
    physioId: uuid()
      .notNull()
      .references(() => physios.id, { onDelete: "cascade" }),
    customerId: uuid().notNull(),
    shareLinkId: uuid(),
    routineId: uuid().notNull(),
    weeklyPlanEntryId: uuid(),
    performedOn: date({ mode: "string" }).notNull(),
    completed: boolean().notNull().default(true),
    pain: smallint(),
    rpe: smallint(),
    comment: text(),
    seenByPhysioAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: "session_logs_customer_fk",
      columns: [t.physioId, t.customerId],
      foreignColumns: [customers.physioId, customers.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "session_logs_routine_fk",
      columns: [t.physioId, t.routineId],
      foreignColumns: [routines.physioId, routines.id],
    }).onDelete("cascade"),
    // One log per routine per plan entry per day; editing updates it (NULL entry = standalone).
    unique("session_logs_routine_entry_day_unique")
      .on(t.routineId, t.weeklyPlanEntryId, t.performedOn)
      .nullsNotDistinct(),
    index("session_logs_customer_idx").on(t.physioId, t.customerId, t.performedOn.desc()),
    index("session_logs_physio_day_idx").on(t.physioId, t.performedOn.desc()),
    index("session_logs_routine_idx").on(t.physioId, t.routineId),
    check(
      "session_logs_pain_range",
      sql`${t.pain} between ${sql.raw(String(PAIN_MIN))} and ${sql.raw(String(PAIN_MAX))}`,
    ),
    check(
      "session_logs_rpe_range",
      sql`${t.rpe} between ${sql.raw(String(RPE_MIN))} and ${sql.raw(String(RPE_MAX))}`,
    ),
    check(
      "session_logs_comment_length",
      sql`char_length(${t.comment}) between 1 and ${sql.raw(String(LOG_COMMENT_MAX))}`,
    ),
    ownRows("session_logs_own", t.physioId),
  ],
);

export type SessionLog = typeof sessionLogs.$inferSelect;
export type NewSessionLog = typeof sessionLogs.$inferInsert;
