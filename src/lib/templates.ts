import { PLAN_NAME_MAX } from "./plans";
import { ROUTINE_NAME_MAX } from "./routines";

export const TEMPLATE_STATUSES = ["active", "archived"] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

export const ASSIGN_STATUSES = ["draft", "active"] as const;
export type AssignStatus = (typeof ASSIGN_STATUSES)[number];

export const LIST_TABS = ["customers", "templates"] as const;
export type ListTab = (typeof LIST_TABS)[number];

export const parseListTab = (value: string | undefined): ListTab =>
  value === "templates" ? "templates" : "customers";

export type TemplateKind = "routine" | "plan";

/** Distinct routine ids in first-appearance order. */
export function distinctRoutineIds(entries: { routineId: string }[]): string[] {
  return [...new Set(entries.map((entry) => entry.routineId))];
}

/** Same entries with routineId replaced via the map; throws if an id has no mapping. */
export function remapEntries<T extends { routineId: string }>(
  entries: T[],
  idMap: ReadonlyMap<string, string>,
): T[] {
  return entries.map((entry) => {
    const routineId = idMap.get(entry.routineId);
    if (routineId === undefined) throw new Error(`No mapping for routine ${entry.routineId}`);
    return { ...entry, routineId };
  });
}

/** "<name><suffix>" cut so the result is at most `max` chars (the name is truncated, never the suffix). */
export function withSuffix(name: string, suffix: string, max: number): string {
  return `${name.slice(0, Math.max(0, max - suffix.length))}${suffix}`;
}

/** Most templates the "From template…" picker shows at once. */
export const TEMPLATE_PICKER_LIMIT = 50;

/** The name limit per kind (routine and plan names share 80 today, but not by contract). */
export const NAME_MAX = { routine: ROUTINE_NAME_MAX, plan: PLAN_NAME_MAX } as const;
