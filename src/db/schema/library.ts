import { sql, type SQL } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { authenticatedRole, authUid } from "drizzle-orm/supabase";

import { timestamps } from "./_columns";
import { bodyAreaEnum, exerciseMediaKindEnum } from "./enums";
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

const NO_PARENT: SQL = sql`'00000000-0000-0000-0000-000000000000'::uuid`;

/**
 * Two-level category tree (spec 03). References are composite (physio_id, …) so a row can
 * never point at another physio's row (FK checks bypass RLS). Depth ≤ 2 is enforced by the
 * exercise_categories_max_depth trigger (custom migration).
 */
export const exerciseCategories = pgTable(
  "exercise_categories",
  {
    id: uuid().primaryKey().defaultRandom(),
    physioId: physioId(),
    parentId: uuid(),
    name: text().notNull(),
    position: integer().notNull(),
    ...timestamps,
  },
  (t) => [
    unique("exercise_categories_physio_id_id_unique").on(t.physioId, t.id),
    foreignKey({
      name: "exercise_categories_parent_fk",
      columns: [t.physioId, t.parentId],
      foreignColumns: [t.physioId, t.id],
    }).onDelete("cascade"),
    uniqueIndex("exercise_categories_name_unique").on(
      t.physioId,
      sql`coalesce(${t.parentId}, ${NO_PARENT})`,
      sql`lower(${t.name})`,
    ),
    index("exercise_categories_parent_id_idx").on(t.physioId, t.parentId),
    check("exercise_categories_name_length", sql`char_length(${t.name}) between 1 and 60`),
    check("exercise_categories_not_own_parent", sql`${t.parentId} <> ${t.id}`),
    check("exercise_categories_position", sql`${t.position} >= 0`),
    ownRows("exercise_categories_own", t.physioId),
  ],
);

/**
 * Library exercises with default prescription. category_id's FK
 * (physio_id, category_id) → exercise_categories ON DELETE SET NULL (category_id) lives in the
 * custom migration: Drizzle can't express the column list.
 */
export const exercises = pgTable(
  "exercises",
  {
    id: uuid().primaryKey().defaultRandom(),
    physioId: physioId(),
    categoryId: uuid(),
    name: text().notNull(),
    instructions: text(),
    bodyAreas: bodyAreaEnum()
      .array()
      .notNull()
      .default(sql`'{}'`),
    tags: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
    archivedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique("exercises_physio_id_id_unique").on(t.physioId, t.id),
    index("exercises_physio_id_archived_at_idx").on(t.physioId, t.archivedAt),
    index("exercises_category_id_idx").on(t.physioId, t.categoryId),
    index("exercises_body_areas_idx").using("gin", t.bodyAreas),
    index("exercises_tags_idx").using("gin", t.tags),
    check("exercises_name_length", sql`char_length(${t.name}) between 1 and 120`),
    check("exercises_instructions_length", sql`char_length(${t.instructions}) <= 5000`),
    check("exercises_tags_count", sql`cardinality(${t.tags}) <= 20`),
    ownRows("exercises_own", t.physioId),
  ],
);

/** Ordered exercise media; position 0 is the cover. YouTube only in v1. */
export const exerciseMedia = pgTable(
  "exercise_media",
  {
    id: uuid().primaryKey().defaultRandom(),
    physioId: physioId(),
    exerciseId: uuid().notNull(),
    kind: exerciseMediaKindEnum().notNull(),
    externalUrl: text().notNull(),
    externalId: text().notNull(),
    position: integer().notNull(),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: "exercise_media_exercise_fk",
      columns: [t.physioId, t.exerciseId],
      foreignColumns: [exercises.physioId, exercises.id],
    }).onDelete("cascade"),
    unique("exercise_media_position_unique").on(t.physioId, t.exerciseId, t.position),
    index("exercise_media_physio_exercise_idx").on(t.physioId, t.exerciseId),
    check("exercise_media_position", sql`${t.position} between 0 and 9`),
    check(
      "exercise_media_youtube_id",
      sql`${t.kind} <> 'youtube' or ${t.externalId} ~ '^[A-Za-z0-9_-]{11}$'`,
    ),
    ownRows("exercise_media_own", t.physioId),
  ],
);

export type ExerciseCategory = typeof exerciseCategories.$inferSelect;
export type Exercise = typeof exercises.$inferSelect;
export type ExerciseMedia = typeof exerciseMedia.$inferSelect;
