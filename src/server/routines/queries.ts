import "server-only";

import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Tx } from "@/db/rls";
import {
  cases,
  customers,
  exercises,
  routineGroups,
  routineItemSets,
  routineItems,
  routines,
} from "@/db/schema";
import type { RoutineFilters } from "@/lib/routine-params";
import type { LoadedGroup, LoadedItem } from "@/lib/routine-editor";
import { ROUTINES_LIST_LIMIT, type RoutineStatus } from "@/lib/routines";
import { escapeLike } from "@/lib/sql-like";
import { parseYouTubeUrl } from "@/lib/youtube";
import type { ExerciseSummary } from "@/server/library/queries";

import { isUuid } from "./schemas";

export type RoutineSummary = {
  id: string;
  name: string;
  status: RoutineStatus;
  /** Null for templates (spec 07). */
  customerId: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  caseTitle: string | null;
  itemCount: number;
  sessionsPerWeek: number | null;
  /** Phase (spec 08): label, inclusive window and the routine this one continues. */
  phaseLabel: string | null;
  startsOn: string | null;
  endsOn: string | null;
  previousId: string | null;
  isStandalone: boolean;
  updatedAt: Date;
};

export async function listRoutines(
  tx: Tx,
  physioId: string,
  filters: RoutineFilters,
  limit = ROUTINES_LIST_LIMIT,
): Promise<{ routines: RoutineSummary[]; truncated: boolean }> {
  // Customers tab: every customer routine. Templates tab: standalone templates only (a template
  // plan's own routines are edited through the plan).
  const conditions: SQL[] =
    filters.tab === "templates"
      ? [
          eq(routines.physioId, physioId),
          eq(routines.isTemplate, true),
          eq(routines.isStandalone, true),
        ]
      : [eq(routines.physioId, physioId), eq(routines.isTemplate, false)];
  if (filters.status !== "all") conditions.push(eq(routines.status, filters.status));
  if (filters.customerId) {
    // A malformed id can never match (and must not reach a uuid comparison).
    if (!isUuid(filters.customerId)) return { routines: [], truncated: false };
    conditions.push(eq(routines.customerId, filters.customerId));
  }
  if (filters.q) {
    conditions.push(
      sql`public.f_unaccent(lower(${routines.name})) like public.f_unaccent(lower(${`%${escapeLike(filters.q)}%`}))`,
    );
  }

  const rows = await tx
    .select({
      id: routines.id,
      name: routines.name,
      status: routines.status,
      customerId: routines.customerId,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      caseTitle: cases.title,
      sessionsPerWeek: routines.sessionsPerWeek,
      phaseLabel: routines.phaseLabel,
      startsOn: routines.startsOn,
      endsOn: routines.endsOn,
      previousId: routines.previousId,
      isStandalone: routines.isStandalone,
      updatedAt: routines.updatedAt,
      // Written out with table aliases: Drizzle renders columns unqualified in a subquery.
      itemCount: sql<number>`(
        select count(*)::int from routine_items i
        where i.physio_id = routines.physio_id and i.routine_id = routines.id)`,
    })
    .from(routines)
    .leftJoin(
      customers,
      and(eq(customers.physioId, routines.physioId), eq(customers.id, routines.customerId)),
    )
    .leftJoin(cases, and(eq(cases.physioId, routines.physioId), eq(cases.id, routines.caseId)))
    .where(and(...conditions))
    .orderBy(desc(routines.updatedAt), asc(routines.id))
    .limit(limit + 1);

  return { routines: rows.slice(0, limit), truncated: rows.length > limit };
}

export type RoutineDetail = {
  id: string;
  version: number;
  /** Null for templates (spec 07). */
  customerId: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  isTemplate: boolean;
  /** The template this routine was copied from, while that template still exists. */
  sourceTemplate: { id: string; name: string } | null;
  name: string;
  notes: string | null;
  caseId: string | null;
  sessionsPerWeek: number | null;
  sessionsPerDay: number | null;
  status: RoutineStatus;
  isStandalone: boolean;
  phaseLabel: string | null;
  startsOn: string | null;
  endsOn: string | null;
  groups: LoadedGroup[];
  items: LoadedItem[];
  cases: { id: string; title: string; status: "open" | "closed" }[];
};

const coverOf = (url: string | null) => {
  const video = url ? parseYouTubeUrl(url) : null;
  return video ? { videoId: video.videoId, isShort: video.isShort } : null;
};

export async function getRoutine(
  tx: Tx,
  physioId: string,
  id: string,
): Promise<RoutineDetail | null> {
  if (!isUuid(id)) return null;
  const source = alias(routines, "source_template");
  const [row] = await tx
    .select({
      id: routines.id,
      version: routines.version,
      customerId: routines.customerId,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      isTemplate: routines.isTemplate,
      sourceTemplateId: source.id,
      sourceTemplateName: source.name,
      name: routines.name,
      notes: routines.notes,
      caseId: routines.caseId,
      sessionsPerWeek: routines.sessionsPerWeek,
      sessionsPerDay: routines.sessionsPerDay,
      status: routines.status,
      isStandalone: routines.isStandalone,
      phaseLabel: routines.phaseLabel,
      startsOn: routines.startsOn,
      endsOn: routines.endsOn,
    })
    .from(routines)
    .leftJoin(
      customers,
      and(eq(customers.physioId, routines.physioId), eq(customers.id, routines.customerId)),
    )
    .leftJoin(
      source,
      and(eq(source.physioId, routines.physioId), eq(source.id, routines.sourceTemplateId)),
    )
    .where(and(eq(routines.physioId, physioId), eq(routines.id, id)));
  if (!row) return null;
  const { sourceTemplateId, sourceTemplateName, ...header } = row;

  const [groups, itemRows, customerCases] = await Promise.all([
    tx
      .select({ id: routineGroups.id, restSeconds: routineGroups.restSeconds })
      .from(routineGroups)
      .where(and(eq(routineGroups.physioId, physioId), eq(routineGroups.routineId, id)))
      .orderBy(asc(routineGroups.createdAt), asc(routineGroups.id)),
    tx
      .select({
        id: routineItems.id,
        exerciseId: routineItems.exerciseId,
        exerciseName: exercises.name,
        exerciseArchivedAt: exercises.archivedAt,
        groupId: routineItems.groupId,
        holdSeconds: routineItems.holdSeconds,
        restSeconds: routineItems.restSeconds,
        side: routineItems.side,
        notes: routineItems.notes,
        coverUrl: sql<string | null>`(
          select m.external_url from exercise_media m
          where m.physio_id = routine_items.physio_id and m.exercise_id = routine_items.exercise_id
          order by m.position limit 1)`,
      })
      .from(routineItems)
      .innerJoin(
        exercises,
        and(
          eq(exercises.physioId, routineItems.physioId),
          eq(exercises.id, routineItems.exerciseId),
        ),
      )
      .where(and(eq(routineItems.physioId, physioId), eq(routineItems.routineId, id)))
      .orderBy(asc(routineItems.position)),
    // Templates have no customer, so no cases.
    header.customerId
      ? tx
          .select({ id: cases.id, title: cases.title, status: cases.status })
          .from(cases)
          .where(and(eq(cases.physioId, physioId), eq(cases.customerId, header.customerId)))
          .orderBy(desc(cases.openedOn), asc(cases.id))
      : Promise.resolve([]),
  ]);

  const setsByItem = new Map<string, LoadedItem["sets"]>();
  if (itemRows.length > 0) {
    const setRows = await tx
      .select({
        itemId: routineItemSets.routineItemId,
        reps: routineItemSets.reps,
        repsMax: routineItemSets.repsMax,
        durationSeconds: routineItemSets.durationSeconds,
        load: routineItemSets.load,
      })
      .from(routineItemSets)
      .where(
        and(
          eq(routineItemSets.physioId, physioId),
          inArray(
            routineItemSets.routineItemId,
            itemRows.map((row) => row.id),
          ),
        ),
      )
      .orderBy(asc(routineItemSets.position));
    for (const { itemId, ...set } of setRows) {
      setsByItem.set(itemId, [...(setsByItem.get(itemId) ?? []), set]);
    }
  }

  return {
    ...header,
    sourceTemplate:
      sourceTemplateId !== null && sourceTemplateName !== null
        ? { id: sourceTemplateId, name: sourceTemplateName }
        : null,
    groups,
    items: itemRows.map(({ exerciseArchivedAt, coverUrl, ...row }) => ({
      ...row,
      exerciseArchived: exerciseArchivedAt !== null,
      cover: coverOf(coverUrl),
      sets: setsByItem.get(row.id) ?? [],
    })),
    cases: customerCases,
  };
}

/**
 * Distinct non-archived exercises, most recently saved into a routine first. A save recreates a
 * routine's rows with one timestamp, so exercises saved together tie on it and the later one in
 * the routine (higher position) comes first; the order among those is best effort, not a history.
 */
export async function listRecentExercises(
  tx: Tx,
  physioId: string,
  limit = 8,
): Promise<ExerciseSummary[]> {
  const recent = tx
    .select({
      exerciseId: routineItems.exerciseId,
      lastUsed: sql<Date>`max(${routineItems.createdAt})`.as("last_used"),
      lastPosition: sql<number>`max(${routineItems.position})`.as("last_position"),
    })
    .from(routineItems)
    .where(eq(routineItems.physioId, physioId))
    .groupBy(routineItems.exerciseId)
    .as("recent");

  const rows = await tx
    .select({
      id: exercises.id,
      name: exercises.name,
      categoryId: exercises.categoryId,
      bodyAreas: exercises.bodyAreas,
      tags: exercises.tags,
      archivedAt: exercises.archivedAt,
      coverUrl: sql<string | null>`(
        select m.external_url from exercise_media m
        where m.physio_id = exercises.physio_id and m.exercise_id = exercises.id
        order by m.position limit 1)`,
    })
    .from(recent)
    .innerJoin(
      exercises,
      and(eq(exercises.physioId, physioId), eq(exercises.id, recent.exerciseId)),
    )
    .where(sql`${exercises.archivedAt} is null`)
    .orderBy(desc(recent.lastUsed), desc(recent.lastPosition), asc(exercises.id))
    .limit(limit);

  return rows.map(({ coverUrl, ...row }) => ({ ...row, cover: coverOf(coverUrl) }));
}
