import type { SaveRoutineInput } from "@/server/routines/schemas";

import { normalizeEntries } from "../plans";
import { GROUP_MIN, type RoutineStatus } from "../routines";
import type { PlanSnapshot, RoutineSnapshot } from "./snapshot";

/**
 * Restoring a version (spec 15 rule 4) brings back content only: name, notes, sessions and the
 * groups/items/sets of a routine, or the entries of a plan. Status, case and the phase window stay
 * as they are now. What no longer exists (or, for a plan, is archived) is dropped and counted.
 */
export function routineRestoreInput(
  snapshot: RoutineSnapshot,
  current: { id: string; version: number; status: RoutineStatus; caseId: string | null },
  existingExerciseIds: ReadonlySet<string>,
): { input: SaveRoutineInput; dropped: number } {
  const ordered = [...snapshot.items].sort((a, b) => a.position - b.position);
  const kept = ordered.filter((item) => existingExerciseIds.has(item.exercise.id));

  const members = new Map<string, number>();
  for (const { prescription } of kept) {
    if (prescription.groupKey !== null) {
      members.set(prescription.groupKey, (members.get(prescription.groupKey) ?? 0) + 1);
    }
  }
  // A superset left with too few members dissolves and its survivor takes the group's rest, as
  // the editor does when a superset shrinks (a grouped item has no rest of its own).
  const keepGroup = (key: string | null): key is string =>
    key !== null && (members.get(key) ?? 0) >= GROUP_MIN;
  const groupRest = (key: string): number | null =>
    snapshot.groups.find((group) => group.key === key)?.restSeconds ?? null;

  return {
    input: {
      id: current.id,
      version: current.version,
      name: snapshot.routine.name,
      notes: snapshot.routine.notes,
      caseId: current.caseId,
      sessionsPerWeek: snapshot.routine.sessionsPerWeek,
      sessionsPerDay: snapshot.routine.sessionsPerDay,
      status: current.status,
      groups: snapshot.groups
        .filter((group) => keepGroup(group.key))
        .map((group) => ({ key: group.key, restSeconds: group.restSeconds })),
      items: kept.map(({ exercise, prescription }) => {
        const { groupKey } = prescription;
        const dissolved = groupKey !== null && !keepGroup(groupKey);
        return {
          exerciseId: exercise.id,
          groupKey: keepGroup(groupKey) ? groupKey : null,
          holdSeconds: prescription.holdSeconds,
          restSeconds: dissolved ? groupRest(groupKey) : prescription.restSeconds,
          side: prescription.side,
          notes: prescription.notes,
          sets: prescription.sets.map((set) => ({ ...set })),
        };
      }),
    },
    dropped: ordered.length - kept.length,
  };
}

/**
 * The snapshot's entries whose routine is still usable, renumbered 0.. within each weekday. They
 * keep their snapshot ids (the plan's current entries are deleted first, and nothing references
 * an entry id), so a diff across a restore matches entries instead of showing them all replaced.
 */
export function planRestoreEntries(
  snapshot: PlanSnapshot,
  usable: ReadonlySet<string>,
): {
  entries: {
    id: string;
    weekday: number;
    position: number;
    routineId: string;
    label: string | null;
  }[];
  dropped: number;
} {
  const kept = snapshot.entries
    .filter((entry) => usable.has(entry.routine.id))
    .map((entry) => ({
      id: entry.id,
      weekday: entry.weekday,
      position: entry.position,
      routineId: entry.routine.id,
      label: entry.label,
    }));
  return {
    entries: normalizeEntries(kept).map(({ id, weekday, position, routineId, label }) => ({
      id,
      weekday,
      position,
      routineId,
      label,
    })),
    dropped: snapshot.entries.length - kept.length,
  };
}
