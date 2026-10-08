import { db } from "@/db";
import {
  customers,
  exerciseMedia,
  exercises,
  routineGroups,
  routineItemSets,
  routineItems,
  routineSections,
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
  /** Name of the section the item sits in; defaults to "Main". Sections are created in order of first use. */
  section?: string;
};

export async function insertRoutine(
  physioId: string,
  customerId: string,
  values: Partial<typeof routines.$inferInsert> & { items?: FixtureItem[] } = {},
): Promise<string> {
  const { items = [], ...rest } = values;
  // One transaction: no committed routine may ever lack its sections (other test files run in parallel).
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(routines)
      .values({ physioId, customerId, name: "Routine", ...rest })
      .returning({ id: routines.id });
    const routineId = row!.id;

    const groupIds = new Map<string, string>();
    for (const key of new Set(items.flatMap((item) => (item.group ? [item.group] : [])))) {
      const [group] = await tx
        .insert(routineGroups)
        .values({ physioId, routineId })
        .returning({ id: routineGroups.id });
      groupIds.set(key, group!.id);
    }
    const sectionIds = new Map<string, string>();
    const sectionName = (item: FixtureItem) => item.section ?? "Main";
    // A routine always has at least the "Main" section, even with no items.
    const names = items.length ? items.map(sectionName) : ["Main"];
    for (const name of new Set(names)) {
      const [section] = await tx
        .insert(routineSections)
        .values({ physioId, routineId, name, position: sectionIds.size })
        .returning({ id: routineSections.id });
      sectionIds.set(name, section!.id);
    }
    for (const [position, item] of items.entries()) {
      const [created] = await tx
        .insert(routineItems)
        .values({
          physioId,
          routineId,
          exerciseId: item.exerciseId,
          position,
          notes: item.notes ?? null,
          sectionId: sectionIds.get(sectionName(item))!,
          groupId: item.group ? groupIds.get(item.group)! : null,
        })
        .returning({ id: routineItems.id });
      const count = item.sets ?? 3;
      await tx.insert(routineItemSets).values(
        Array.from({ length: count }, (_, setPosition) => ({
          physioId,
          routineItemId: created!.id,
          position: setPosition,
          reps: item.reps ?? 10,
        })),
      );
    }
    return routineId;
  });
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
