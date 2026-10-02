import { describe, expect, it } from "vitest";
import { diffPlans, diffRoutines } from "./diff";
import type { PlanSnapshot, RoutineSnapshot } from "./snapshot";

type Item = RoutineSnapshot["items"][number];
type ItemOverrides = Partial<Omit<Item, "prescription">> & {
  prescription?: Partial<Item["prescription"]>;
};

const set = (reps: number | null = 10) => ({
  reps,
  repsMax: null,
  durationSeconds: null,
  load: null,
});

function item(exerciseId: string, overrides: ItemOverrides = {}): Item {
  const { prescription, ...rest } = overrides;
  return {
    exercise: { id: exerciseId, name: exerciseId, instructions: null },
    position: 0,
    ...rest,
    prescription: {
      groupKey: null,
      holdSeconds: null,
      restSeconds: null,
      side: null,
      notes: null,
      sets: [set(), set()],
      ...prescription,
    },
  };
}

function routine(
  items: Item[],
  header: Partial<RoutineSnapshot["routine"]> = {},
  groups: RoutineSnapshot["groups"] = [],
): RoutineSnapshot {
  return {
    schema: 1,
    routine: {
      name: "R",
      notes: null,
      status: "draft",
      caseId: null,
      sessionsPerWeek: null,
      sessionsPerDay: null,
      phaseLabel: null,
      startsOn: null,
      endsOn: null,
      ...header,
    },
    groups,
    items: items.map((it, position) => ({ ...it, position })),
  };
}

describe("diffRoutines", () => {
  it("reports identical routines as unchanged", () => {
    const a = routine([item("a"), item("b")]);
    const diff = diffRoutines(a, structuredClone(a));
    expect(diff.header).toEqual([]);
    expect(diff.items.map((i) => i.status)).toEqual(["unchanged", "unchanged"]);
    expect(diff.items.every((i) => !i.moved && i.changes.length === 0)).toBe(true);
  });

  it("marks an appended item as added", () => {
    const diff = diffRoutines(routine([item("a")]), routine([item("a"), item("b")]));
    expect(diff.items.map((i) => i.status)).toEqual(["unchanged", "added"]);
    expect(diff.items[1].before).toBeNull();
    expect(diff.items[1].after?.exercise.id).toBe("b");
  });

  it("keeps a removed item at its old index", () => {
    const diff = diffRoutines(
      routine([item("a"), item("b"), item("c")]),
      routine([item("a"), item("c")]),
    );
    expect(diff.items.map((i) => [i.status, (i.before ?? i.after)?.exercise.id])).toEqual([
      ["unchanged", "a"],
      ["removed", "b"],
      ["unchanged", "c"],
    ]);
    expect(diff.items[1].after).toBeNull();
    expect(diff.items.every((i) => !i.moved)).toBe(true);
  });

  it("flags exactly one move when two items swap", () => {
    const diff = diffRoutines(routine([item("a"), item("b")]), routine([item("b"), item("a")]));
    expect(diff.items.filter((i) => i.moved)).toHaveLength(1);
    expect(diff.items.map((i) => i.status)).toEqual(["unchanged", "unchanged"]);
  });

  it("reports a rep change on one set", () => {
    const before = routine([item("a")]);
    const after = routine([item("a", { prescription: { sets: [set(10), set(12)] } })]);
    const [d] = diffRoutines(before, after).items;
    expect(d.status).toBe("changed");
    expect(d.changes).toEqual([]);
    expect(d.sets).toEqual([
      { index: 1, kind: "changed", changes: [{ field: "reps", from: 10, to: 12 }] },
    ]);
  });

  it("reports an added set and the set count", () => {
    const before = routine([item("a")]);
    const after = routine([item("a", { prescription: { sets: [set(), set(), set(8)] } })]);
    const [d] = diffRoutines(before, after).items;
    expect(d.status).toBe("changed");
    expect(d.sets).toEqual([{ index: 2, kind: "added", set: set(8) }]);
    expect(d.changes).toEqual([{ field: "sets", from: 2, to: 3 }]);
  });

  it("reports a removed set", () => {
    const before = routine([item("a")]);
    const after = routine([item("a", { prescription: { sets: [set()] } })]);
    const [d] = diffRoutines(before, after).items;
    expect(d.sets).toEqual([{ index: 1, kind: "removed", set: set() }]);
    expect(d.changes).toEqual([{ field: "sets", from: 2, to: 1 }]);
  });

  it("reports side, notes, hold and rest changes", () => {
    const before = routine([item("a")]);
    const after = routine([
      item("a", {
        prescription: { side: "left", notes: "slow", holdSeconds: 5, restSeconds: 20 },
      }),
    ]);
    const [d] = diffRoutines(before, after).items;
    expect(d.changes).toEqual(
      expect.arrayContaining([
        { field: "side", from: null, to: "left" },
        { field: "notes", from: null, to: "slow" },
        { field: "holdSeconds", from: null, to: 5 },
        { field: "restSeconds", from: null, to: 20 },
      ]),
    );
    expect(d.changes).toHaveLength(4);
  });

  it("gives both items a group change when they become a superset", () => {
    const before = routine([item("a"), item("b")]);
    const after = routine(
      [
        item("a", { prescription: { groupKey: "g0" } }),
        item("b", { prescription: { groupKey: "g0" } }),
      ],
      {},
      [{ key: "g0", restSeconds: 30 }],
    );
    const diff = diffRoutines(before, after);
    for (const d of diff.items) {
      expect(d.status).toBe("changed");
      expect(d.changes.map((c) => c.field)).toEqual(["group"]);
    }
  });

  it("does not flag a group whose key was renumbered", () => {
    const grouped = (key: string) =>
      routine(
        [
          item("a", { prescription: { groupKey: key } }),
          item("b", { prescription: { groupKey: key } }),
        ],
        {},
        [{ key, restSeconds: 30 }],
      );
    const diff = diffRoutines(grouped("g0"), grouped("g1"));
    expect(diff.items.map((i) => i.status)).toEqual(["unchanged", "unchanged"]);
  });

  it("flags a group rest change", () => {
    const grouped = (rest: number) =>
      routine(
        [
          item("a", { prescription: { groupKey: "g0" } }),
          item("b", { prescription: { groupKey: "g0" } }),
        ],
        {},
        [{ key: "g0", restSeconds: rest }],
      );
    const diff = diffRoutines(grouped(30), grouped(45));
    expect(diff.items.map((i) => i.status)).toEqual(["changed", "changed"]);
  });

  it("pairs repeated exercises by occurrence", () => {
    const before = routine([item("a"), item("a")]);
    const after = routine([item("a"), item("a", { prescription: { notes: "x" } })]);
    const diff = diffRoutines(before, after);
    expect(diff.items.map((i) => i.status)).toEqual(["unchanged", "changed"]);
    expect(diff.items.some((i) => i.moved)).toBe(false);
  });

  it("reports header changes", () => {
    const diff = diffRoutines(
      routine([], { name: "Old", status: "draft", startsOn: null }),
      routine([], { name: "New", status: "active", startsOn: "2026-02-01" }),
    );
    expect(diff.header).toEqual([
      { field: "name", from: "Old", to: "New" },
      { field: "status", from: "draft", to: "active" },
      { field: "startsOn", from: null, to: "2026-02-01" },
    ]);
  });
});

type Entry = PlanSnapshot["entries"][number];
const entry = (id: string, overrides: Partial<Entry> = {}): Entry => ({
  id,
  weekday: 1,
  position: 0,
  label: null,
  routine: { id: "r1", name: "R1", version: 1 },
  ...overrides,
});
const plan = (entries: Entry[], header: Partial<PlanSnapshot["plan"]> = {}): PlanSnapshot => ({
  schema: 1,
  plan: {
    name: "P",
    notes: null,
    status: "draft",
    caseId: null,
    phaseLabel: null,
    startsOn: null,
    endsOn: null,
    ...header,
  },
  entries,
});

describe("diffPlans", () => {
  it("reports identical plans as unchanged", () => {
    const p = plan([entry("n1")]);
    const diff = diffPlans(p, structuredClone(p));
    expect(diff.header).toEqual([]);
    expect(diff.entries.map((e) => [e.status, e.moved])).toEqual([["unchanged", false]]);
  });

  it("marks added and removed entries", () => {
    const diff = diffPlans(plan([entry("n1")]), plan([entry("n2")]));
    const byId = Object.fromEntries(diff.entries.map((e) => [(e.before ?? e.after)!.id, e.status]));
    expect(byId).toEqual({ n1: "removed", n2: "added" });
  });

  it("flags a weekday move", () => {
    const diff = diffPlans(plan([entry("n1")]), plan([entry("n1", { weekday: 3 })]));
    expect(diff.entries[0]).toMatchObject({ status: "unchanged", moved: true });
  });

  it("flags a position move", () => {
    const diff = diffPlans(plan([entry("n1")]), plan([entry("n1", { position: 1 })]));
    expect(diff.entries[0]).toMatchObject({ status: "unchanged", moved: true });
  });

  it("reports a label change", () => {
    const diff = diffPlans(plan([entry("n1")]), plan([entry("n1", { label: "AM" })]));
    expect(diff.entries[0].status).toBe("changed");
    expect(diff.entries[0].changes).toEqual([{ field: "label", from: null, to: "AM" }]);
  });

  it("reports a swapped routine", () => {
    const diff = diffPlans(
      plan([entry("n1")]),
      plan([entry("n1", { routine: { id: "r2", name: "R2", version: 1 } })]),
    );
    expect(diff.entries[0].status).toBe("changed");
    expect(diff.entries[0].changes).toEqual([{ field: "routine", from: "r1", to: "r2" }]);
  });

  it("reports header changes", () => {
    const diff = diffPlans(plan([], { name: "A" }), plan([], { name: "B", phaseLabel: "Phase 2" }));
    expect(diff.header).toEqual([
      { field: "name", from: "A", to: "B" },
      { field: "phaseLabel", from: null, to: "Phase 2" },
    ]);
  });
});
