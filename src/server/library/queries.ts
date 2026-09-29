import "server-only";

import { and, asc, eq, isNotNull, isNull, sql, type SQL } from "drizzle-orm";

import type { Tx } from "@/db/rls";
import { exerciseCategories, exerciseMedia, exercises, type Exercise } from "@/db/schema";
import type { BodyArea } from "@/lib/body-areas";
import { buildCategoryTree, type CategoryNode } from "@/lib/category-tree";
import type { LibraryFilters } from "@/lib/library-params";
import { escapeLike } from "@/lib/sql-like";
import { parseYouTubeUrl } from "@/lib/youtube";

export const LIST_LIMIT = 500;

export async function listCategoryTree(tx: Tx, physioId: string): Promise<CategoryNode[]> {
  const rows = await tx
    .select({
      id: exerciseCategories.id,
      parentId: exerciseCategories.parentId,
      name: exerciseCategories.name,
      position: exerciseCategories.position,
      activeCount: sql<number>`(count(${exercises.id}) filter (where ${exercises.archivedAt} is null))::int`,
      totalCount: sql<number>`count(${exercises.id})::int`,
    })
    .from(exerciseCategories)
    .leftJoin(
      exercises,
      and(
        eq(exercises.physioId, exerciseCategories.physioId),
        eq(exercises.categoryId, exerciseCategories.id),
      ),
    )
    .where(eq(exerciseCategories.physioId, physioId))
    .groupBy(exerciseCategories.id);
  return buildCategoryTree(rows);
}

export type ExerciseSummary = {
  id: string;
  name: string;
  categoryId: string | null;
  bodyAreas: BodyArea[];
  tags: string[];
  archivedAt: Date | null;
  cover: { videoId: string; isShort: boolean } | null;
};

export async function listExercises(
  tx: Tx,
  physioId: string,
  filters: LibraryFilters,
): Promise<ExerciseSummary[]> {
  const conditions: SQL[] = [eq(exercises.physioId, physioId)];
  const { category } = filters;
  conditions.push(
    category.kind === "archived" ? isNotNull(exercises.archivedAt) : isNull(exercises.archivedAt),
  );
  if (category.kind === "none") conditions.push(isNull(exercises.categoryId));
  if (category.kind === "category") {
    conditions.push(sql`${exercises.categoryId} in (
      select ${exerciseCategories.id} from ${exerciseCategories}
      where ${exerciseCategories.physioId} = ${physioId}
        and (${exerciseCategories.id} = ${category.id} or ${exerciseCategories.parentId} = ${category.id}))`);
  }
  if (filters.area)
    conditions.push(sql`${exercises.bodyAreas} @> array[${filters.area}]::public.body_area[]`);
  if (filters.tag) conditions.push(sql`${exercises.tags} @> array[${filters.tag}]::text[]`);
  if (filters.q) {
    const term = escapeLike(filters.q.toLowerCase());
    conditions.push(sql`(
      public.f_unaccent(lower(${exercises.name})) like public.f_unaccent(${`%${term}%`})
      or exists (
        select 1 from unnest(${exercises.tags}) as tag
        where public.f_unaccent(tag) like public.f_unaccent(${`${term}%`})))`);
  }

  const rows = await tx
    .select({
      id: exercises.id,
      name: exercises.name,
      categoryId: exercises.categoryId,
      bodyAreas: exercises.bodyAreas,
      tags: exercises.tags,
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
    .limit(LIST_LIMIT);

  return rows.map(({ coverUrl, ...row }) => {
    const video = coverUrl ? parseYouTubeUrl(coverUrl) : null;
    return { ...row, cover: video ? { videoId: video.videoId, isShort: video.isShort } : null };
  });
}

export async function listTags(tx: Tx, physioId: string): Promise<string[]> {
  const rows = await tx.execute<{ tag: string }>(sql`
    select distinct unnest(${exercises.tags}) as tag from ${exercises}
    where ${exercises.physioId} = ${physioId}
    order by tag`);
  return rows.map((row) => row.tag);
}

export type ExerciseDetail = Exercise & {
  media: { id: string; url: string; videoId: string; isShort: boolean }[];
};

export async function getExercise(
  tx: Tx,
  physioId: string,
  id: string,
): Promise<ExerciseDetail | null> {
  const [exercise] = await tx
    .select()
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
