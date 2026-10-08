import "server-only";

import { and, asc, eq, getTableColumns, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Tx } from "@/db/rls";
import {
  exerciseCategories,
  exerciseCategoryLinks,
  exerciseMedia,
  exercises,
  type Exercise,
} from "@/db/schema";
import type { BodyArea } from "@/lib/body-areas";
import type { ExerciseKind } from "@/lib/exercise-kinds";
import { buildCategoryTree, type CategoryNode } from "@/lib/category-tree";
import type { LibraryFilters } from "@/lib/library-params";
import { escapeLike } from "@/lib/sql-like";
import { parseYouTubeUrl } from "@/lib/youtube";

export const LIST_LIMIT = 500;

/** The category and, for a top-level one, its sub-categories: what filtering by it covers. */
const scope = alias(exerciseCategories, "scope");

export async function listCategoryTree(tx: Tx, physioId: string): Promise<CategoryNode[]> {
  // Counts are distinct exercises across the category's scope, so an exercise filed under a
  // category and its sub-category counts once.
  const rows = await tx
    .select({
      id: exerciseCategories.id,
      parentId: exerciseCategories.parentId,
      name: exerciseCategories.name,
      position: exerciseCategories.position,
      activeCount: sql<number>`(count(distinct ${exercises.id}) filter (where ${exercises.archivedAt} is null))::int`,
      totalCount: sql<number>`count(distinct ${exercises.id})::int`,
    })
    .from(exerciseCategories)
    .leftJoin(
      scope,
      and(
        eq(scope.physioId, exerciseCategories.physioId),
        or(eq(scope.id, exerciseCategories.id), eq(scope.parentId, exerciseCategories.id)),
      ),
    )
    .leftJoin(
      exerciseCategoryLinks,
      and(
        eq(exerciseCategoryLinks.physioId, scope.physioId),
        eq(exerciseCategoryLinks.categoryId, scope.id),
      ),
    )
    .leftJoin(
      exercises,
      and(
        eq(exercises.physioId, exerciseCategoryLinks.physioId),
        eq(exercises.id, exerciseCategoryLinks.exerciseId),
      ),
    )
    .where(eq(exerciseCategories.physioId, physioId))
    .groupBy(exerciseCategories.id);
  return buildCategoryTree(rows);
}

/**
 * The ids of an `exercises` row's categories, sorted by id. Written with the table name: Drizzle
 * renders columns unqualified in a single-table select, which would resolve to the subquery's own
 * table.
 */
export const exerciseCategoryIds = sql<string[]>`coalesce((
  select array_agg(l.category_id order by l.category_id) from exercise_category_links l
  where l.physio_id = exercises.physio_id and l.exercise_id = exercises.id), '{}')`;

export type ExerciseSummary = {
  id: string;
  name: string;
  kind: ExerciseKind;
  categoryIds: string[];
  bodyAreas: BodyArea[];
  archivedAt: Date | null;
  cover: { videoId: string; isShort: boolean } | null;
};

export async function listExercises(
  tx: Tx,
  physioId: string,
  filters: LibraryFilters,
  limit = LIST_LIMIT,
): Promise<{ exercises: ExerciseSummary[]; truncated: boolean }> {
  const conditions: SQL[] = [eq(exercises.physioId, physioId)];
  const { category } = filters;
  conditions.push(
    category.kind === "archived" ? isNotNull(exercises.archivedAt) : isNull(exercises.archivedAt),
  );
  if (category.kind === "none") {
    conditions.push(sql`not exists (
      select 1 from exercise_category_links l
      where l.physio_id = exercises.physio_id and l.exercise_id = exercises.id)`);
  }
  if (category.kind === "category") {
    // The exercise's categories contain this one or one of its sub-categories.
    conditions.push(sql`exists (
      select 1 from exercise_category_links l
      join exercise_categories c on c.physio_id = l.physio_id and c.id = l.category_id
      where l.physio_id = exercises.physio_id and l.exercise_id = exercises.id
        and (c.id = ${category.id} or c.parent_id = ${category.id}))`);
  }
  if (filters.area)
    conditions.push(sql`${exercises.bodyAreas} @> array[${filters.area}]::public.body_area[]`);
  if (filters.q) {
    const term = escapeLike(filters.q);
    conditions.push(
      sql`public.f_unaccent(lower(${exercises.name})) like public.f_unaccent(lower(${`%${term}%`}))`,
    );
  }

  const rows = await tx
    .select({
      id: exercises.id,
      name: exercises.name,
      kind: exercises.kind,
      categoryIds: exerciseCategoryIds,
      bodyAreas: exercises.bodyAreas,
      archivedAt: exercises.archivedAt,
      // Columns are written out with table aliases: Drizzle renders them unqualified in a
      // single-table select, which would resolve to the subquery's own table.
      coverUrl: sql<string | null>`(
        select m.external_url from exercise_media m
        where m.physio_id = exercises.physio_id and m.exercise_id = exercises.id
        order by m.position limit 1)`,
    })
    .from(exercises)
    .where(and(...conditions))
    .orderBy(sql`lower(${exercises.name})`, asc(exercises.id))
    .limit(limit + 1);

  const exercisesPage = rows.slice(0, limit).map(({ coverUrl, ...row }) => {
    const video = coverUrl ? parseYouTubeUrl(coverUrl) : null;
    return { ...row, cover: video ? { videoId: video.videoId, isShort: video.isShort } : null };
  });
  return { exercises: exercisesPage, truncated: rows.length > limit };
}

/** Whether the physio owns any exercise at all, archived included. */
export async function hasAnyExercises(tx: Tx, physioId: string): Promise<boolean> {
  const rows = await tx.execute<{ found: boolean }>(sql`
    select exists(select 1 from ${exercises} where ${exercises.physioId} = ${physioId}) as found`);
  return rows[0]?.found === true;
}

export type ExerciseDetail = Exercise & {
  categoryIds: string[];
  media: { id: string; url: string; videoId: string; isShort: boolean }[];
};

export async function getExercise(
  tx: Tx,
  physioId: string,
  id: string,
): Promise<ExerciseDetail | null> {
  const [exercise] = await tx
    .select({ ...getTableColumns(exercises), categoryIds: exerciseCategoryIds })
    .from(exercises)
    .where(and(eq(exercises.physioId, physioId), eq(exercises.id, id)));
  if (!exercise) return null;
  const media = await tx
    .select({ id: exerciseMedia.id, url: exerciseMedia.externalUrl })
    .from(exerciseMedia)
    .where(and(eq(exerciseMedia.physioId, physioId), eq(exerciseMedia.exerciseId, id)))
    .orderBy(asc(exerciseMedia.position));
  return {
    ...exercise,
    media: media.flatMap(({ id: mediaId, url }) => {
      const video = parseYouTubeUrl(url);
      return video
        ? [{ id: mediaId, url: video.url, videoId: video.videoId, isShort: video.isShort }]
        : [];
    }),
  };
}
