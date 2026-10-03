import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import {
  exerciseMedia,
  exercises,
  routineGroups,
  routineItemSets,
  routineItems,
  routines,
} from "@/db/schema";
import type { ItemPrescription, SetPrescription } from "@/lib/prescription";
import { parseYouTubeUrl } from "@/lib/youtube";
import type { Queryable } from "@/server/branding/queries";

export type ContentItem = ItemPrescription & {
  id: string;
  name: string;
  instructions: string | null;
  sets: SetPrescription[];
  media: { videoId: string; isShort: boolean }[];
};

export type ContentBlock =
  | { kind: "single"; item: ContentItem }
  | { kind: "group"; key: string; restSeconds: number | null; items: ContentItem[] };

export type RoutineContent = {
  id: string;
  name: string;
  notes: string | null;
  sessionsPerWeek: number | null;
  sessionsPerDay: number | null;
  blocks: ContentBlock[];
};

/** Routines with their exercises, grouped into supersets, for the given (already scoped) ids. */
export async function loadRoutineContent(
  q: Queryable,
  physioId: string,
  customerId: string,
  ids: string[],
): Promise<Map<string, RoutineContent>> {
  const result = new Map<string, RoutineContent>();
  if (ids.length === 0) return result;

  const headers = await q
    .select({
      id: routines.id,
      name: routines.name,
      notes: routines.notes,
      sessionsPerWeek: routines.sessionsPerWeek,
      sessionsPerDay: routines.sessionsPerDay,
    })
    .from(routines)
    .where(
      and(
        eq(routines.physioId, physioId),
        eq(routines.customerId, customerId),
        inArray(routines.id, ids),
      ),
    );
  if (headers.length === 0) return result;
  const routineIds = headers.map((header) => header.id);

  const [groupRows, itemRows] = await Promise.all([
    q
      .select({ id: routineGroups.id, restSeconds: routineGroups.restSeconds })
      .from(routineGroups)
      .where(
        and(eq(routineGroups.physioId, physioId), inArray(routineGroups.routineId, routineIds)),
      ),
    q
      .select({
        id: routineItems.id,
        routineId: routineItems.routineId,
        exerciseId: routineItems.exerciseId,
        groupId: routineItems.groupId,
        name: exercises.name,
        instructions: exercises.instructions,
        holdSeconds: routineItems.holdSeconds,
        restSeconds: routineItems.restSeconds,
        side: routineItems.side,
        notes: routineItems.notes,
      })
      .from(routineItems)
      .innerJoin(
        exercises,
        and(
          eq(exercises.physioId, routineItems.physioId),
          eq(exercises.id, routineItems.exerciseId),
        ),
      )
      .where(and(eq(routineItems.physioId, physioId), inArray(routineItems.routineId, routineIds)))
      .orderBy(asc(routineItems.routineId), asc(routineItems.position)),
  ]);

  const itemIds = itemRows.map((item) => item.id);
  const exerciseIds = [...new Set(itemRows.map((item) => item.exerciseId))];
  const [setRows, mediaRows] = itemRows.length
    ? await Promise.all([
        q
          .select({
            itemId: routineItemSets.routineItemId,
            reps: routineItemSets.reps,
            repsMax: routineItemSets.repsMax,
            durationSeconds: routineItemSets.durationSeconds,
            load: routineItemSets.load,
            distanceMeters: routineItemSets.distanceMeters,
            intensity: routineItemSets.intensity,
          })
          .from(routineItemSets)
          .where(
            and(
              eq(routineItemSets.physioId, physioId),
              inArray(routineItemSets.routineItemId, itemIds),
            ),
          )
          .orderBy(asc(routineItemSets.routineItemId), asc(routineItemSets.position)),
        q
          .select({
            exerciseId: exerciseMedia.exerciseId,
            kind: exerciseMedia.kind,
            url: exerciseMedia.externalUrl,
          })
          .from(exerciseMedia)
          .where(
            and(
              eq(exerciseMedia.physioId, physioId),
              inArray(exerciseMedia.exerciseId, exerciseIds),
            ),
          )
          .orderBy(asc(exerciseMedia.exerciseId), asc(exerciseMedia.position)),
      ])
    : [[], []];

  const setsByItem = new Map<string, SetPrescription[]>();
  for (const { itemId, ...set } of setRows) {
    setsByItem.set(itemId, [...(setsByItem.get(itemId) ?? []), set]);
  }
  const mediaByExercise = new Map<string, ContentItem["media"]>();
  for (const row of mediaRows) {
    const video = row.kind === "youtube" ? parseYouTubeUrl(row.url) : null;
    if (!video) continue;
    mediaByExercise.set(row.exerciseId, [
      ...(mediaByExercise.get(row.exerciseId) ?? []),
      { videoId: video.videoId, isShort: video.isShort },
    ]);
  }
  const restOfGroup = new Map(groupRows.map((group) => [group.id, group.restSeconds]));

  for (const header of headers) {
    const blocks: ContentBlock[] = [];
    for (const row of itemRows.filter((item) => item.routineId === header.id)) {
      const item: ContentItem = {
        id: row.id,
        name: row.name,
        instructions: row.instructions,
        holdSeconds: row.holdSeconds,
        restSeconds: row.restSeconds,
        side: row.side,
        notes: row.notes,
        sets: setsByItem.get(row.id) ?? [],
        media: mediaByExercise.get(row.exerciseId) ?? [],
      };
      const last = blocks.at(-1);
      if (row.groupId === null) {
        blocks.push({ kind: "single", item });
      } else if (last?.kind === "group" && last.key === row.groupId) {
        last.items.push(item);
      } else {
        blocks.push({
          kind: "group",
          key: row.groupId,
          restSeconds: restOfGroup.get(row.groupId) ?? null,
          items: [item],
        });
      }
    }
    result.set(header.id, { ...header, blocks });
  }
  return result;
}
