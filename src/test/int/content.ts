import { db } from "@/db";
import {
  customers,
  exerciseMedia,
  exercises,
  routineGroups,
  routineItemSets,
  routineItems,
  routines,
  weeklyPlanDays,
  weeklyPlanEntries,
  weeklyPlans,
} from "@/db/schema";

/** Owner-connection fixtures for integration tests: rows built directly, bypassing the mutations. */

export async function insertCustomer(
  physioId: string,
  values: Partial<typeof customers.$inferInsert> = {},
): Promise<string> {
  const [row] = await db
    .insert(customers)
    .values({ physioId, firstName: "Ana", locale: "en", ...values })
    .returning({ id: customers.id });
  return row!.id;
}

export async function insertExercise(
  physioId: string,
  values: { name?: string; instructions?: string | null; youtubeId?: string | null } = {},
): Promise<string> {
  const { youtubeId = null, ...rest } = values;
  const [row] = await db
    .insert(exercises)
    .values({ physioId, name: "Squat", ...rest })
    .returning({ id: exercises.id });
  if (youtubeId) {
    await db.insert(exerciseMedia).values({
      physioId,
      exerciseId: row!.id,
      kind: "youtube",
      externalUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
      externalId: youtubeId,
      position: 0,
    });
  }
  return row!.id;
}

export type FixtureItem = {
  exerciseId: string;
  reps?: number;
  sets?: number;
  notes?: string;
  /** Items sharing a group key form one superset. */
  group?: string;
};

export async function insertRoutine(
  physioId: string,
  customerId: string,
  values: Partial<typeof routines.$inferInsert> & { items?: FixtureItem[] } = {},
): Promise<string> {
  const { items = [], ...rest } = values;
  const [row] = await db
    .insert(routines)
    .values({ physioId, customerId, name: "Routine", ...rest })
    .returning({ id: routines.id });
  const routineId = row!.id;

  const groupIds = new Map<string, string>();
  for (const key of new Set(items.flatMap((item) => (item.group ? [item.group] : [])))) {
    const [group] = await db
      .insert(routineGroups)
      .values({ physioId, routineId })
      .returning({ id: routineGroups.id });
    groupIds.set(key, group!.id);
  }
  for (const [position, item] of items.entries()) {
    const [created] = await db
      .insert(routineItems)
      .values({
        physioId,
        routineId,
        exerciseId: item.exerciseId,
        position,
        notes: item.notes ?? null,
        groupId: item.group ? groupIds.get(item.group)! : null,
      })
      .returning({ id: routineItems.id });
    const count = item.sets ?? 3;
    await db.insert(routineItemSets).values(
      Array.from({ length: count }, (_, setPosition) => ({
        physioId,
        routineItemId: created!.id,
        position: setPosition,
        reps: item.reps ?? 10,
      })),
    );
  }
  return routineId;
}

export async function insertPlan(
  physioId: string,
  customerId: string | null,
  values: Partial<typeof weeklyPlans.$inferInsert> & {
    entries?: { weekday: number; routineId: string; label?: string }[];
    days?: { weekday: number; notes: string }[];
  } = {},
): Promise<string> {
  const { entries = [], days = [], ...rest } = values;
  const [row] = await db
    .insert(weeklyPlans)
    .values({ physioId, customerId, name: "Week", ...rest })
    .returning({ id: weeklyPlans.id });
  for (const [position, entry] of entries.entries()) {
    await db.insert(weeklyPlanEntries).values({
      physioId,
      weeklyPlanId: row!.id,
      weekday: entry.weekday,
      routineId: entry.routineId,
      position,
      label: entry.label ?? null,
    });
  }
  for (const day of days) {
    await db
      .insert(weeklyPlanDays)
      .values({ physioId, weeklyPlanId: row!.id, weekday: day.weekday, notes: day.notes });
  }
  return row!.id;
}
