import { describe, expect, it } from "vitest";

import { planRestoreEntries, routineRestoreInput } from "./restore";
import type { PlanSnapshot, RoutineSnapshot } from "./snapshot";

type Item = RoutineSnapshot["items"][number];

const set = (reps: number) => ({ reps, repsMax: null, durationSeconds: null, load: null });
// Old snapshots carry no aerobic fields; restoring fills them with null.
const restored = (reps: number) => ({ ...set(reps), distanceMeters: null, intensity: null });

function item(exerciseId: string, groupKey: string | null = null, reps = 10): Item {
  return {
    exercise: { id: exerciseId, name: `Exercise ${exerciseId}`, instructions: null },
    position: 0,
    prescription: {
      groupKey,
      holdSeconds: 5,
      restSeconds: groupKey === null ? 30 : null,
      side: "left",
      notes: "slowly",
      sets: [set(reps), set(reps)],
    },
  };
}

function routine(items: Item[], groups: RoutineSnapshot["groups"] = []): RoutineSnapshot {
  return {
    schema: 1,
    routine: {
      name: "Knee",
      notes: "Old notes",
      status: "draft",
      caseId: null,
      sessionsPerWeek: 3,
      sessionsPerDay: 1,
      phaseLabel: "Phase 1",
      startsOn: "2026-01-01",
      endsOn: null,
    },
    groups,
    items: items.map((it, position) => ({ ...it, position })),
  };
}

const current = {
  id: "routine-1",
  version: 7,
  status: "active" as const,
  caseId: "case-1",
};

describe("routineRestoreInput", () => {
  it("restores the snapshot content with the routine's current id, version, status and case", () => {
    const snapshot = routine(
      [item("a"), item("b", "g0"), item("c", "g0")],
      [{ key: "g0", restSeconds: 60 }],
    );
    const { input, dropped } = routineRestoreInput(snapshot, current, new Set(["a", "b", "c"]));
    expect(dropped).toBe(0);
    expect(input).toEqual({
      id: "routine-1",
      version: 7,
      name: "Knee",
      notes: "Old notes",
      caseId: "case-1",
      sessionsPerWeek: 3,
      sessionsPerDay: 1,
      status: "active",
      groups: [{ key: "g0", restSeconds: 60 }],
      items: [
        {
          exerciseId: "a",
          groupKey: null,
          holdSeconds: 5,
          restSeconds: 30,
          side: "left",
          notes: "slowly",
          sets: [restored(10), restored(10)],
        },
        {
          exerciseId: "b",
          groupKey: "g0",
          holdSeconds: 5,
          restSeconds: null,
          side: "left",
          notes: "slowly",
          sets: [restored(10), restored(10)],
        },
        {
          exerciseId: "c",
          groupKey: "g0",
          holdSeconds: 5,
          restSeconds: null,
          side: "left",
          notes: "slowly",
          sets: [restored(10), restored(10)],
        },
      ],
    });
  });

  it("orders items by position", () => {
    const snapshot = routine([item("a"), item("b")]);
    snapshot.items.reverse();
    const { input } = routineRestoreInput(snapshot, current, new Set(["a", "b"]));
    expect(input.items.map((it) => it.exerciseId)).toEqual(["a", "b"]);
  });

  it("drops items whose exercise no longer exists", () => {
    const snapshot = routine([item("a"), item("gone"), item("b")]);
    const { input, dropped } = routineRestoreInput(snapshot, current, new Set(["a", "b"]));
    expect(dropped).toBe(1);
    expect(input.items.map((it) => it.exerciseId)).toEqual(["a", "b"]);
  });

  it("ungroups the survivor of a two-exercise superset that lost a member, giving it the group's rest", () => {
    const snapshot = routine(
      [item("a", "g0"), item("gone", "g0"), item("b")],
      [{ key: "g0", restSeconds: 60 }],
    );
    const { input, dropped } = routineRestoreInput(snapshot, current, new Set(["a", "b"]));
    expect(dropped).toBe(1);
    expect(input.groups).toEqual([]);
    expect(input.items[0]).toMatchObject({ exerciseId: "a", groupKey: null, restSeconds: 60 });
    // A single item keeps its own rest.
    expect(input.items[1]).toMatchObject({ exerciseId: "b", groupKey: null, restSeconds: 30 });
  });

  it("gives a dissolved superset's survivor no rest when the group had none", () => {
    const snapshot = routine(
      [item("a", "g0"), item("gone", "g0")],
      [{ key: "g0", restSeconds: null }],
    );
    const { input } = routineRestoreInput(snapshot, current, new Set(["a"]));
    expect(input.items[0]).toMatchObject({ exerciseId: "a", groupKey: null, restSeconds: null });
  });

  it("keeps a three-exercise superset that lost one member", () => {
    const snapshot = routine(
      [item("a", "g0"), item("gone", "g0"), item("b", "g0")],
      [{ key: "g0", restSeconds: 60 }],
    );
    const { input, dropped } = routineRestoreInput(snapshot, current, new Set(["a", "b"]));
    expect(dropped).toBe(1);
    expect(input.groups).toEqual([{ key: "g0", restSeconds: 60 }]);
    expect(input.items.map((it) => [it.exerciseId, it.groupKey])).toEqual([
      ["a", "g0"],
      ["b", "g0"],
    ]);
  });
});

type Entry = PlanSnapshot["entries"][number];

const entry = (id: string, weekday: number, position: number, routineId: string): Entry => ({
  id,
  weekday,
  position,
  label: id === "e1" ? "AM" : null,
  routine: { id: routineId, name: routineId, version: 1 },
});

const plan = (entries: Entry[]): PlanSnapshot => ({
  schema: 1,
  plan: {
    name: "Week",
    notes: null,
    status: "draft",
    caseId: null,
    phaseLabel: null,
    startsOn: null,
    endsOn: null,
  },
  entries,
});

describe("planRestoreEntries", () => {
  it("keeps every entry whose routine is usable, with its id", () => {
    const snapshot = plan([entry("e1", 1, 0, "r1"), entry("e2", 3, 0, "r2")]);
    expect(planRestoreEntries(snapshot, new Set(["r1", "r2"]))).toEqual({
      entries: [
        { id: "e1", weekday: 1, position: 0, routineId: "r1", label: "AM" },
        { id: "e2", weekday: 3, position: 0, routineId: "r2", label: null },
      ],
      dropped: 0,
    });
  });

  it("drops entries of unusable routines and renumbers each day from 0", () => {
    const snapshot = plan([
      entry("e1", 1, 0, "archived"),
      entry("e2", 1, 1, "r1"),
      entry("e3", 1, 2, "r2"),
      entry("e4", 2, 0, "archived"),
      entry("e5", 2, 1, "r2"),
    ]);
    expect(planRestoreEntries(snapshot, new Set(["r1", "r2"]))).toEqual({
      entries: [
        { id: "e2", weekday: 1, position: 0, routineId: "r1", label: null },
        { id: "e3", weekday: 1, position: 1, routineId: "r2", label: null },
        { id: "e5", weekday: 2, position: 0, routineId: "r2", label: null },
      ],
      dropped: 2,
    });
  });
});
