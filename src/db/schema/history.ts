import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { authenticatedRole, authUid } from "drizzle-orm/supabase";

// Relative imports: drizzle-kit loads the schema without the "@/" alias.
import type { PlanSnapshot, RoutineSnapshot } from "../../lib/history/snapshot";
import type { ChangeSummary } from "../../lib/history/summary";
import { timestamps } from "./_columns";
import { versionKindEnum } from "./enums";
import { physios } from "./physios";
import { weeklyPlans } from "./plans";
import { routines } from "./routines";

const physioId = () =>
  uuid()
    .notNull()
    .references(() => physios.id, { onDelete: "cascade" });

/**
 * Immutable snapshots of a routine (spec 15). Physios can read and insert their own rows;
 * there is no update or delete policy, so a version never changes (it only goes away when its
 * routine is deleted).
 */
export const routineVersions = pgTable(
  "routine_versions",
  {
    id: uuid().primaryKey().defaultRandom(),
    physioId: physioId(),
    routineId: uuid().notNull(),
    version: integer().notNull(),
    kind: versionKindEnum().notNull(),
    restoredFrom: integer(),
    snapshot: jsonb().$type<RoutineSnapshot>().notNull(),
    summary: jsonb().$type<ChangeSummary>(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "routine_versions_routine_fk",
      columns: [t.physioId, t.routineId],
      foreignColumns: [routines.physioId, routines.id],
    }).onDelete("cascade"),
    unique("routine_versions_routine_version_unique").on(t.routineId, t.version),
    index("routine_versions_routine_idx").on(t.physioId, t.routineId, t.version.desc()),
    check("routine_versions_version_positive", sql`${t.version} >= 1`),
    check(
      "routine_versions_restored_from",
      sql`(${t.kind} = 'restored') = (${t.restoredFrom} is not null)`,
    ),
    pgPolicy("routine_versions_select", {
      for: "select",
      to: authenticatedRole,
      using: sql`${t.physioId} = ${authUid}`,
    }),
    pgPolicy("routine_versions_insert", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${t.physioId} = ${authUid}`,
    }),
  ],
);

/**
 * Snapshots of a weekly plan (spec 15). Same as routine versions, but the physio may update
 * their own rows (session_id links a version to the session it belongs to).
 */
export const weeklyPlanVersions = pgTable(
  "weekly_plan_versions",
  {
    id: uuid().primaryKey().defaultRandom(),
    physioId: physioId(),
    weeklyPlanId: uuid().notNull(),
    version: integer().notNull(),
    kind: versionKindEnum().notNull(),
    restoredFrom: integer(),
    snapshot: jsonb().$type<PlanSnapshot>().notNull(),
    summary: jsonb().$type<ChangeSummary>(),
    sessionId: uuid(),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: "weekly_plan_versions_plan_fk",
      columns: [t.physioId, t.weeklyPlanId],
      foreignColumns: [weeklyPlans.physioId, weeklyPlans.id],
    }).onDelete("cascade"),
    unique("weekly_plan_versions_plan_version_unique").on(t.weeklyPlanId, t.version),
    index("weekly_plan_versions_plan_idx").on(t.physioId, t.weeklyPlanId, t.version.desc()),
    check("weekly_plan_versions_version_positive", sql`${t.version} >= 1`),
    check(
      "weekly_plan_versions_restored_from",
      sql`(${t.kind} = 'restored') = (${t.restoredFrom} is not null)`,
    ),
    pgPolicy("weekly_plan_versions_select", {
      for: "select",
      to: authenticatedRole,
      using: sql`${t.physioId} = ${authUid}`,
    }),
    pgPolicy("weekly_plan_versions_insert", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${t.physioId} = ${authUid}`,
    }),
    pgPolicy("weekly_plan_versions_update", {
      for: "update",
      to: authenticatedRole,
      using: sql`${t.physioId} = ${authUid}`,
      withCheck: sql`${t.physioId} = ${authUid}`,
    }),
  ],
);

export type RoutineVersion = typeof routineVersions.$inferSelect;
export type NewRoutineVersion = typeof routineVersions.$inferInsert;
export type WeeklyPlanVersion = typeof weeklyPlanVersions.$inferSelect;
export type NewWeeklyPlanVersion = typeof weeklyPlanVersions.$inferInsert;
