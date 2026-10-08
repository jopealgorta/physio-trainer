import { describe, expect, it } from "vitest";
import { diffPlans, diffRoutines } from "./diff";
import { summarizeRoutine } from "./summary";
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
  distanceMeters: null,
  intensity: null,
});

function item(exerciseId: string, overrides: ItemOverrides = {}): Item {
  const { prescription, ...rest } = overrides;
  return {
    exercise: { id: exerciseId, name: exerciseId, instructions: null },
    position: 0,
    ...rest,
    prescription: {
      groupKey: null,
      sectionKey: null,
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
  sections: RoutineSnapshot["sections"] = [],
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
    sections,
    groups,
    items: items.map((it, position) => ({ ...it, position })),
  };
}

describe("diffRoutines sections", () => {
  const sec = (...names: string[]) => names.map((name, i) => ({ key: `s${i}`, name }));
  const inSection = (key: string) => ({ prescription: { sectionKey: key } });

  it("reports no section changes when the old snapshot has no sections", () => {
    const before = routine([item("a")]);
    delete (before as { sections?: unknown }).sections;
    const after = routine([item("a", inSection("s0"))], {}, [], sec("Main"));
    const diff = diffRoutines(before, after);
    expect(diff.header).toEqual([]);
    expect(diff.items[0].changes).toEqual([]);
    expect(diff.items[0].status).toBe("unchanged");
  });

  it("reports one sections header change when a section is added", () => {
    const before = routine([item("a", inSection("s0"))], {}, [], sec("Warm-up", "Main"));
    const after = routine(
      [item("a", inSection("s0"))],
      {},
      [],
      sec("Warm-up", "Main", "Cool-down"),
    );
    expect(diffRoutines(before, after).header).toEqual([
      { field: "sections", from: "Warm-up, Main", to: "Warm-up, Main, Cool-down" },
    ]);
  });

  it("reports a renamed section as a header change", () => {
    const before = routine([item("a", inSection("s0"))], {}, [], sec("Main"));
    const after = routine([item("a", inSection("s0"))], {}, [], sec("Warm-up"));
    expect(diffRoutines(before, after).header).toEqual([
      { field: "sections", from: "Main", to: "Warm-up" },
    ]);
  });

  it("reports an item moved to another section by name", () => {
    const before = routine([item("a", inSection("s0"))], {}, [], sec("Warm-up", "Main"));
    const after = routine([item("a", inSection("s1"))], {}, [], sec("Warm-up", "Main"));
    const [diff] = diffRoutines(before, after).items;
    expect(diff.status).toBe("changed");
    expect(diff.changes).toEqual([{ field: "section", from: "Warm-up", to: "Main" }]);
  });

  it("counts section changes in the summary", () => {
    const before = routine([item("a", inSection("s0"))], {}, [], sec("Warm-up", "Main"));
    const after = routine([item("a", inSection("s1"))], {}, [], sec("Warm-up", "Main"));
    expect(summarizeRoutine(diffRoutines(before, after)).fields.section).toBe(1);
  });
});

describe("diffRoutines", () => {
  it("reports a changed intensity and distance on a set", () => {
    const before = routine([item("a", { prescription: { sets: [set()] } })]);
    const after = routine([
      item("a", {
        prescription: { sets: [{ ...set(), intensity: "Zone 2", distanceMeters: 5000 }] },
      }),
    ]);
    const [diff] = diffRoutines(before, after).items;
    expect(diff.sets).toEqual([
      {
        index: 0,
        kind: "changed",
        changes: [
          { field: "distanceMeters", from: null, to: 5000 },
          { field: "intensity", from: null, to: "Zone 2" },
        ],
      },
    ]);
  });

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
const plan = (
  entries: Entry[],
  header: Partial<PlanSnapshot["plan"]> = {},
  days: PlanSnapshot["days"] = [],
): PlanSnapshot => ({
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
  days,
});

describe("old-shape snapshots", () => {
  it("diffs a set without aerobic keys against an identical set with nulls as unchanged", () => {
    const old = { ...set(10), distanceMeters: undefined, intensity: undefined } as never;
    const before = routine([item("e1", { prescription: { sets: [old] } })]);
    const after = routine([item("e1", { prescription: { sets: [set(10)] } })]);
    const diff = diffRoutines(before, after);
    expect(diff.items.map((i) => i.status)).toEqual(["unchanged"]);
    expect(diff.items[0].sets).toEqual([]);
  });

  it("diffs a plan snapshot without days against one with days: []", () => {
    const old = { ...plan([entry("n1")]), days: undefined } as unknown as PlanSnapshot;
    const diff = diffPlans(old, plan([entry("n1")]));
    expect(diff.days).toEqual([]);
    expect(diff.header).toEqual([]);
  });
});

describe("diffPlans", () => {
  it("reports an added, changed and removed day note per weekday", () => {
    const before = plan([], {}, [
      { weekday: 3, notes: "Easy" },
      { weekday: 5, notes: "Pool" },
    ]);
    const after = plan([], {}, [
      { weekday: 1, notes: "New" },
      { weekday: 3, notes: "Hard" },
    ]);
    expect(diffPlans(before, after).days).toEqual([
      { weekday: 1, before: null, after: "New" },
      { weekday: 3, before: "Easy", after: "Hard" },
      { weekday: 5, before: "Pool", after: null },
    ]);
    expect(diffPlans(before, structuredClone(before)).days).toEqual([]);
  });

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

  const monday = (...ids: string[]) => ids.map((id, position) => entry(id, { position }));
  const movedIds = (diff: ReturnType<typeof diffPlans>) =>
    diff.entries.filter((e) => e.moved).map((e) => (e.before ?? e.after)!.id);

  it("does not flag the entries renumbered after one is removed", () => {
    const diff = diffPlans(plan(monday("n1", "n2", "n3")), plan(monday("n2", "n3")));
    expect(movedIds(diff)).toEqual([]);
    expect(diff.entries.map((e) => [(e.before ?? e.after)!.id, e.status])).toEqual([
      ["n1", "removed"],
      ["n2", "unchanged"],
      ["n3", "unchanged"],
    ]);
  });

  it("does not flag the entries shifted when one is added at the top of the day", () => {
    const diff = diffPlans(plan(monday("n1", "n2")), plan(monday("n0", "n1", "n2")));
    expect(movedIds(diff)).toEqual([]);
  });

  it("flags only the entry moved to the top of its day", () => {
    const diff = diffPlans(plan(monday("n1", "n2", "n3")), plan(monday("n3", "n1", "n2")));
    expect(movedIds(diff)).toEqual(["n3"]);
  });

  it("flags an entry moved to another day, but not the ones left behind or shifted", () => {
    const before = plan([...monday("n1", "n2", "n3"), entry("t1", { weekday: 2 })]);
    const after = plan([
      ...monday("n2", "n3"),
      entry("n1", { weekday: 2, position: 0 }),
      entry("t1", { weekday: 2, position: 1 }),
    ]);
    expect(movedIds(diffPlans(before, after))).toEqual(["n1"]);
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
