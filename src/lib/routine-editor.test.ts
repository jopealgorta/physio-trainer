import { beforeEach, describe, expect, it } from "vitest";

import {
  addItem,
  addSet,
  canAddItem,
  canAddSet,
  canGroupWithNext,
  canRemoveSet,
  duplicateItem,
  flatItems,
  fromLoaded,
  groupWithNext,
  itemCount,
  itemsWithInvalidSets,
  newItem,
  removeItem,
  removeSet,
  reorderGroupItems,
  toSaveBlocks,
  ungroup,
  updateGroupRest,
  updateItem,
  updateSet,
  type EditorBlock,
  type EditorItem,
  type LoadedItem,
} from "./routine-editor";
import { EMPTY_ITEM_PRESCRIPTION, EMPTY_SET, type SetPrescription } from "./prescription";
import { GROUP_MAX, GROUP_MIN, MAX_ITEMS, MAX_SETS } from "./routines";
import { validateStructure } from "./routine-structure";

let n = 0;
const nk = () => `k${++n}`;
beforeEach(() => {
  n = 0;
});

function mk(
  exerciseName: string,
  sets: Partial<SetPrescription>[] = [{}],
  prescription: Partial<EditorItem> = {},
): EditorItem {
  return {
    ...EMPTY_ITEM_PRESCRIPTION,
    key: nk(),
    exerciseId: `ex-${exerciseName}`,
    exerciseName,
    exerciseArchived: false,
    cover: null,
    sets: sets.map((set) => ({ ...EMPTY_SET, ...set, key: nk() })),
    ...prescription,
  };
}
const single = (item: EditorItem): EditorBlock => ({ kind: "single", key: item.key, item });
const group = (key: string, restSeconds: number | null, items: EditorItem[]): EditorBlock => ({
  kind: "group",
  key,
  restSeconds,
  items,
});
const setCounts = (block: EditorBlock) =>
  block.kind === "single" ? [block.item.sets.length] : block.items.map((i) => i.sets.length);

function assertValid(blocks: EditorBlock[]) {
  const { groups, items } = toSaveBlocks(blocks);
  expect(
    validateStructure(
      groups,
      items.map((item) => ({
        groupKey: item.groupKey,
        restSeconds: item.restSeconds,
        setCount: item.sets.length,
      })),
    ),
  ).toEqual([]);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

describe("items", () => {
  it("newItem has exactly one empty set and an empty prescription", () => {
    const item = newItem(
      { id: "e1", name: "Squat", archived: false, cover: { videoId: "v", isShort: true } },
      nk,
    );
    expect(item.sets).toHaveLength(1);
    expect(item.sets[0]).toMatchObject(EMPTY_SET);
    expect(item).toMatchObject({
      ...EMPTY_ITEM_PRESCRIPTION,
      exerciseId: "e1",
      exerciseName: "Squat",
      exerciseArchived: false,
      cover: { videoId: "v", isShort: true },
    });
    expect(item.key).not.toBe(item.sets[0].key);
  });

  it("addItem appends a single and stops at MAX_ITEMS", () => {
    let blocks: EditorBlock[] = [];
    for (let i = 0; i < MAX_ITEMS; i++) {
      expect(canAddItem(blocks)).toBe(true);
      blocks = addItem(blocks, mk(`e${i}`));
    }
    expect(itemCount(blocks)).toBe(MAX_ITEMS);
    expect(blocks.every((b) => b.kind === "single")).toBe(true);
    expect(canAddItem(blocks)).toBe(false);
    expect(addItem(blocks, mk("extra"))).toBe(blocks);
  });

  it("flatItems flattens groups in order", () => {
    const [a, b, c] = [mk("a"), mk("b"), mk("c")];
    expect(flatItems([single(a), group("g", null, [b, c])])).toEqual([a, b, c]);
  });

  it("itemsWithInvalidSets lists the items whose sets break the rep-range rule", () => {
    const ok = mk("ok");
    const bad = { ...mk("bad"), sets: [{ ...mk("bad").sets[0], reps: 12, repsMax: 10 }] };
    const noReps = { ...mk("nr"), sets: [{ ...mk("nr").sets[0], reps: null, repsMax: 8 }] };
    const valid = { ...mk("v"), sets: [{ ...mk("v").sets[0], reps: 8, repsMax: 12 }] };
    expect(
      itemsWithInvalidSets([single(ok), group("g", null, [bad, valid]), single(noReps)]),
    ).toEqual([bad.key, noReps.key]);
    expect(itemsWithInvalidSets([single(ok), single(valid)])).toEqual([]);
  });

  it("removeItem removes from a single", () => {
    const [a, b] = [mk("a"), mk("b")];
    expect(removeItem([single(a), single(b)], a.key)).toEqual([single(b)]);
  });

  it("removeItem from a group of 3 keeps a group of 2", () => {
    const [a, b, c] = [mk("a"), mk("b"), mk("c")];
    const out = removeItem([group("g", 45, [a, b, c])], b.key);
    expect(out).toEqual([group("g", 45, [a, c])]);
  });

  it("removeItem from a group of 2 dissolves into a single carrying the group's rest", () => {
    const [a, b, c] = [mk("a"), mk("b"), mk("c")];
    const out = removeItem([single(a), group("g", 45, [b, c])], b.key);
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual(single({ ...c, restSeconds: 45 }));
  });

  it("duplicateItem inserts a single after the block with fresh keys and copied sets", () => {
    const a = mk("a", [{ reps: 10 }, { reps: 8 }], { notes: "slow" });
    const b = mk("b");
    const out = duplicateItem([single(a), single(b)], a.key, nk);
    expect(out).toHaveLength(3);
    const copy = (out[1] as Extract<EditorBlock, { kind: "single" }>).item;
    expect(copy.key).not.toBe(a.key);
    expect(out[1].key).toBe(copy.key);
    expect(copy.exerciseId).toBe(a.exerciseId);
    expect(copy.notes).toBe("slow");
    expect(copy.sets.map((s) => s.reps)).toEqual([10, 8]);
    const oldKeys = new Set(a.sets.map((s) => s.key));
    expect(copy.sets.every((s) => !oldKeys.has(s.key))).toBe(true);
    expect(flatItems(out)[0]).toBe(a);
    expect((out[2] as { item: EditorItem }).item).toBe(b);
  });

  it("duplicating a group member leaves the group intact and puts the copy after the group", () => {
    const [a, b, c] = [mk("a"), mk("b"), mk("c")];
    const grp = group("g", 30, [a, b]);
    const out = duplicateItem([grp, single(c)], a.key, nk);
    expect(out).toHaveLength(3);
    expect(out[0]).toBe(grp);
    expect(out[1].kind).toBe("single");
    expect((out[1] as { item: EditorItem }).item.exerciseName).toBe("a");
    expect(out[2]).toEqual(single(c));
    assertValid(out);
  });

  it("duplicateItem is a no-op at MAX_ITEMS", () => {
    let blocks: EditorBlock[] = [];
    for (let i = 0; i < MAX_ITEMS; i++) blocks = addItem(blocks, mk(`e${i}`));
    expect(duplicateItem(blocks, flatItems(blocks)[0].key, nk)).toBe(blocks);
  });

  it("updateItem patches hold/side/notes", () => {
    const a = mk("a");
    const [block] = updateItem([single(a)], a.key, { holdSeconds: 5, side: "left", notes: "n" });
    expect((block as { item: EditorItem }).item).toMatchObject({
      holdSeconds: 5,
      side: "left",
      notes: "n",
    });
  });

  it("updateItem ignores restSeconds for a grouped item but applies it for a single", () => {
    const [a, b, c] = [mk("a"), mk("b"), mk("c")];
    const out = updateItem([group("g", null, [a, b]), single(c)], a.key, {
      restSeconds: 30,
      notes: "x",
    });
    const grouped = out[0] as Extract<EditorBlock, { kind: "group" }>;
    expect(grouped.items[0].restSeconds).toBeNull();
    expect(grouped.items[0].notes).toBe("x");
    const out2 = updateItem(out, c.key, { restSeconds: 30 });
    expect((out2[1] as { item: EditorItem }).item.restSeconds).toBe(30);
  });
});

describe("sets", () => {
  it("addSet copies the previous set's values with a fresh key", () => {
    const a = mk("a", [{ reps: 10, load: "5 kg" }]);
    const [block] = addSet([single(a)], a.key, nk);
    const sets = (block as { item: EditorItem }).item.sets;
    expect(sets).toHaveLength(2);
    expect(sets[1]).toMatchObject({ reps: 10, load: "5 kg" });
    expect(sets[1].key).not.toBe(sets[0].key);
  });

  it("addSet on an item with no sets adds an empty set", () => {
    const a = mk("a", []);
    const [block] = addSet([single(a)], a.key, nk);
    expect((block as { item: EditorItem }).item.sets).toHaveLength(1);
  });

  it("addSet respects MAX_SETS and canAddSet is false at 20", () => {
    let blocks: EditorBlock[] = [single(mk("a"))];
    const key = flatItems(blocks)[0].key;
    while (canAddSet(blocks, key)) blocks = addSet(blocks, key, nk);
    expect(flatItems(blocks)[0].sets).toHaveLength(MAX_SETS);
    expect(canAddSet(blocks, key)).toBe(false);
    expect(addSet(blocks, key, nk)).toBe(blocks);
  });

  it("addSet in a group adds a set to every member", () => {
    const a = mk("a", [{ reps: 5 }]);
    const b = mk("b", [{ reps: 9 }]);
    const out = addSet([group("g", null, [a, b])], a.key, nk);
    const items = flatItems(out);
    expect(items.map((i) => i.sets.length)).toEqual([2, 2]);
    expect(items[0].sets[1].reps).toBe(5);
    expect(items[1].sets[1].reps).toBe(9);
    assertValid(out);
  });

  it("removeSet on a single can remove down to zero sets", () => {
    const a = mk("a", [{ reps: 1 }, { reps: 2 }]);
    let blocks: EditorBlock[] = [single(a)];
    expect(canRemoveSet(blocks, a.key)).toBe(true);
    blocks = removeSet(blocks, a.key, a.sets[0].key);
    blocks = removeSet(blocks, a.key, a.sets[1].key);
    expect(flatItems(blocks)[0].sets).toEqual([]);
    expect(canRemoveSet(blocks, a.key)).toBe(false);
  });

  it("removeSet in a group removes the same index from all members", () => {
    const a = mk("a", [{ reps: 1 }, { reps: 2 }, { reps: 3 }]);
    const b = mk("b", [{ reps: 4 }, { reps: 5 }, { reps: 6 }]);
    const out = removeSet([group("g", null, [a, b])], b.key, b.sets[1].key);
    const items = flatItems(out);
    expect(items[0].sets.map((s) => s.reps)).toEqual([1, 3]);
    expect(items[1].sets.map((s) => s.reps)).toEqual([4, 6]);
  });

  it("canRemoveSet is false for group members with 1 set and removeSet is a no-op", () => {
    const a = mk("a");
    const b = mk("b");
    const blocks = [group("g", null, [a, b])];
    expect(canRemoveSet(blocks, a.key)).toBe(false);
    expect(removeSet(blocks, a.key, a.sets[0].key)).toBe(blocks);
  });

  it("updateSet patches only that set", () => {
    const a = mk("a", [{ reps: 1 }, { reps: 2 }]);
    const b = mk("b", [{ reps: 3 }]);
    const out = updateSet([single(a), single(b)], a.key, a.sets[1].key, { reps: 12, load: "3" });
    const items = flatItems(out);
    expect(items[0].sets[0].reps).toBe(1);
    expect(items[0].sets[1]).toMatchObject({ reps: 12, load: "3", key: a.sets[1].key });
    expect(items[1]).toBe(b);
  });
});

describe("supersets", () => {
  it("groups two singles with the first non-null rest, members' rest null, sets padded", () => {
    const a = mk("a", [{ reps: 1 }], { restSeconds: null });
    const b = mk("b", [{ reps: 2 }, { reps: 3 }, { reps: 4 }], { restSeconds: 60 });
    const c = mk("c");
    const blocks = [single(a), single(b), single(c)];
    expect(canGroupWithNext(blocks, a.key)).toBe(true);
    const out = groupWithNext(blocks, a.key, nk);
    expect(out).toHaveLength(2);
    const grp = out[0] as Extract<EditorBlock, { kind: "group" }>;
    expect(grp.kind).toBe("group");
    expect(grp.restSeconds).toBe(60);
    expect(grp.items.map((i) => i.exerciseName)).toEqual(["a", "b"]);
    expect(grp.items.every((i) => i.restSeconds === null)).toBe(true);
    expect(setCounts(grp)).toEqual([3, 3]);
    expect(grp.items[0].sets.map((s) => s.reps)).toEqual([1, 1, 1]);
    expect(new Set(grp.items[0].sets.map((s) => s.key)).size).toBe(3);
    expect(out[1]).toEqual(single(c));
    assertValid(out);
  });

  it("prefers the left single's rest when both have one", () => {
    const a = mk("a", [{}], { restSeconds: 20 });
    const b = mk("b", [{}], { restSeconds: 90 });
    const out = groupWithNext([single(a), single(b)], a.key, nk);
    expect((out[0] as Extract<EditorBlock, { kind: "group" }>).restSeconds).toBe(20);
  });

  it("pads an item without sets using empty sets and syncs to at least 1", () => {
    const a = mk("a", []);
    const b = mk("b", []);
    const out = groupWithNext([single(a), single(b)], a.key, nk);
    const grp = out[0] as Extract<EditorBlock, { kind: "group" }>;
    expect(setCounts(grp)).toEqual([1, 1]);
    expect(grp.items[0].sets[0]).toMatchObject(EMPTY_SET);
    assertValid(out);
  });

  it("single + group merges into that group's key (group on the left)", () => {
    const [a, b, c] = [mk("a"), mk("b"), mk("c", [{}, {}])];
    const out = groupWithNext([group("g", null, [a, b]), single(c)], "g", nk);
    expect(out).toHaveLength(1);
    const grp = out[0] as Extract<EditorBlock, { kind: "group" }>;
    expect(grp.key).toBe("g");
    expect(grp.items.map((i) => i.exerciseName)).toEqual(["a", "b", "c"]);
    expect(setCounts(grp)).toEqual([2, 2, 2]);
    assertValid(out);
  });

  it("single + group where the group is on the right gets a new key and the group's rest", () => {
    const [a, b, c] = [mk("a"), mk("b"), mk("c")];
    const out = groupWithNext([single(a), group("g", 75, [b, c])], a.key, nk);
    expect(out).toHaveLength(1);
    const grp = out[0] as Extract<EditorBlock, { kind: "group" }>;
    expect(grp.items.map((i) => i.exerciseName)).toEqual(["a", "b", "c"]);
    expect(grp.restSeconds).toBe(75);
    assertValid(out);
  });

  it("refuses when the result would exceed GROUP_MAX", () => {
    const [a, b, c, d] = [mk("a"), mk("b"), mk("c"), mk("d")];
    const blocks = [group("g", null, [a, b, c]), single(d)];
    expect(GROUP_MAX).toBe(3);
    expect(canGroupWithNext(blocks, "g")).toBe(false);
    expect(groupWithNext(blocks, "g", nk)).toBe(blocks);
    const two = [group("g", null, [a, b]), group("h", null, [c, d])];
    expect(canGroupWithNext(two, "g")).toBe(false);
    expect(groupWithNext(two, "g", nk)).toBe(two);
  });

  it("refuses for the last block and for unknown keys", () => {
    const [a, b] = [mk("a"), mk("b")];
    const blocks = [single(a), single(b)];
    expect(canGroupWithNext(blocks, b.key)).toBe(false);
    expect(groupWithNext(blocks, b.key, nk)).toBe(blocks);
    expect(canGroupWithNext(blocks, "nope")).toBe(false);
    expect(groupWithNext(blocks, "nope", nk)).toBe(blocks);
  });

  it("ungroup yields singles in order, each with the group's rest", () => {
    const [a, b, c, d] = [mk("a"), mk("b"), mk("c"), mk("d")];
    const out = ungroup([single(a), group("g", 40, [b, c]), single(d)], "g");
    expect(out.map((block) => block.kind)).toEqual(["single", "single", "single", "single"]);
    expect(flatItems(out).map((i) => [i.exerciseName, i.restSeconds])).toEqual([
      ["a", null],
      ["b", 40],
      ["c", 40],
      ["d", null],
    ]);
    expect(out.map((b) => b.key)).toEqual([a.key, b.key, c.key, d.key]);
    assertValid(out);
  });

  it("updateGroupRest sets the group's rest", () => {
    const [a, b] = [mk("a"), mk("b")];
    const out = updateGroupRest([group("g", null, [a, b])], "g", 90);
    expect((out[0] as Extract<EditorBlock, { kind: "group" }>).restSeconds).toBe(90);
    const cleared = updateGroupRest(out, "g", null);
    expect((cleared[0] as Extract<EditorBlock, { kind: "group" }>).restSeconds).toBeNull();
  });

  it("reorderGroupItems replaces member order only", () => {
    const [a, b, c] = [mk("a"), mk("b"), mk("c")];
    const blocks = [group("g", 30, [a, b, c])];
    const out = reorderGroupItems(blocks, "g", [c, a, b]);
    const grp = out[0] as Extract<EditorBlock, { kind: "group" }>;
    expect(grp.items.map((i) => i.exerciseName)).toEqual(["c", "a", "b"]);
    expect(grp.restSeconds).toBe(30);
    expect(grp.key).toBe("g");
    // membership cannot change through reorder
    expect(reorderGroupItems(blocks, "g", [c, a])).toBe(blocks);
    expect(reorderGroupItems(blocks, "g", [c, a, mk("z")])).toBe(blocks);
  });
});

describe("toSaveBlocks", () => {
  it("emits flat items in order, group keys for members, groups in first-appearance order", () => {
    const [a, b, c, d, e] = [
      mk("a", [{ reps: 8 }], { holdSeconds: 3, restSeconds: 20, side: "left", notes: "x" }),
      mk("b"),
      mk("c"),
      mk("d"),
      mk("e"),
    ];
    const blocks = [single(a), group("g1", 60, [b, c]), group("g2", null, [d, e])];
    const out = toSaveBlocks(blocks);
    expect(out.groups).toEqual([
      { key: "g1", restSeconds: 60 },
      { key: "g2", restSeconds: null },
    ]);
    expect(out.items.map((i) => [i.exerciseId, i.groupKey])).toEqual([
      ["ex-a", null],
      ["ex-b", "g1"],
      ["ex-c", "g1"],
      ["ex-d", "g2"],
      ["ex-e", "g2"],
    ]);
    expect(out.items[0]).toEqual({
      exerciseId: "ex-a",
      groupKey: null,
      holdSeconds: 3,
      restSeconds: 20,
      side: "left",
      notes: "x",
      sets: [
        {
          reps: 8,
          repsMax: null,
          durationSeconds: null,
          load: null,
          distanceMeters: null,
          intensity: null,
        },
      ],
    });
    assertValid(blocks);
  });

  it("validateStructure accepts the output of every valid arrangement", () => {
    const [a, b, c, d] = [mk("a"), mk("b", [{}, {}]), mk("c"), mk("d")];
    const pair = groupWithNext([single(a), single(b), single(c)], a.key, nk);
    const triple = groupWithNext(pair, pair[0].key, nk);
    const arrangements: EditorBlock[][] = [
      [],
      [single(a), single(b)],
      pair,
      triple,
      ungroup(triple, triple[0].key),
      [single(c), ...groupWithNext([single(a), single(b)], a.key, nk), single(d)],
    ];
    for (const blocks of arrangements) assertValid(blocks);
  });
});

describe("fromLoaded", () => {
  const loaded = (
    id: string,
    groupId: string | null,
    sets: Partial<SetPrescription>[],
    extra: Partial<LoadedItem> = {},
  ): LoadedItem => ({
    ...EMPTY_ITEM_PRESCRIPTION,
    id,
    exerciseId: `ex-${id}`,
    exerciseName: id,
    exerciseArchived: false,
    cover: null,
    groupId,
    sets: sets.map((s) => ({ ...EMPTY_SET, ...s })),
    ...extra,
  });

  it("groups consecutive items by groupId, keeps group rest and block key = group id", () => {
    const items = [
      loaded("a", null, [{ reps: 5 }], { restSeconds: 30 }),
      loaded("b", "g1", [{ reps: 6 }, { reps: 7 }]),
      loaded("c", "g1", [{ reps: 8 }, { reps: 9 }]),
      loaded("d", null, []),
    ];
    const out = fromLoaded(items, [{ id: "g1", restSeconds: 75 }], nk);
    expect(out.map((b) => b.kind)).toEqual(["single", "group", "single"]);
    expect(out[1].key).toBe("g1");
    expect((out[1] as Extract<EditorBlock, { kind: "group" }>).restSeconds).toBe(75);
    expect(flatItems(out).map((i) => i.exerciseName)).toEqual(["a", "b", "c", "d"]);
    expect(out[0].key).toBe((out[0] as { item: EditorItem }).item.key);
    const keys = flatItems(out).flatMap((i) => [i.key, ...i.sets.map((s) => s.key)]);
    expect(new Set(keys).size).toBe(keys.length);
    assertValid(out);
  });

  it("round-trips the prescription values through toSaveBlocks", () => {
    const items = [
      loaded("a", null, [{ reps: 5, repsMax: 8, load: "2 kg" }, { durationSeconds: 30 }], {
        holdSeconds: 4,
        restSeconds: 45,
        side: "both",
        notes: "slow",
      }),
      loaded("b", "g1", [{ reps: 10 }]),
      loaded("c", "g1", [{ reps: 12, load: "bw" }]),
    ];
    const save = toSaveBlocks(fromLoaded(items, [{ id: "g1", restSeconds: 60 }], nk));
    expect(save.groups).toEqual([{ key: "g1", restSeconds: 60 }]);
    expect(save.items).toEqual(
      items.map((item) => ({
        exerciseId: item.exerciseId,
        groupKey: item.groupId,
        holdSeconds: item.holdSeconds,
        restSeconds: item.restSeconds,
        side: item.side,
        notes: item.notes,
        sets: item.sets,
      })),
    );
  });

  it("splits a run of a groupId that is not consecutive into separate blocks, dissolving undersized runs", () => {
    const items = [
      loaded("a", "g1", [{}]),
      loaded("b", null, [{}]),
      loaded("c", "g1", [{}]),
      loaded("d", "g2", [{}]),
    ];
    const out = fromLoaded(
      items,
      [
        { id: "g1", restSeconds: 10 },
        { id: "g2", restSeconds: 20 },
      ],
      nk,
    );
    expect(out.every((b) => b.kind === "single")).toBe(true);
    expect(flatItems(out).map((i) => i.restSeconds)).toEqual([10, null, 10, 20]);
    assertValid(out);
  });
});

describe("invariants under random operation sequences", () => {
  function rng(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`keeps every group 2..3 members with equal set counts (seed ${seed})`, () => {
      const random = rng(seed);
      const pick = <T>(list: T[]): T | undefined => list[Math.floor(random() * list.length)];
      let blocks: EditorBlock[] = [];
      let exercise = 0;
      for (let step = 0; step < 400; step++) {
        const items = flatItems(blocks);
        const groups = blocks.filter((b) => b.kind === "group");
        const item = pick(items);
        const block = pick(blocks);
        const op = Math.floor(random() * 15);
        switch (op) {
          case 0:
          case 1:
          case 2:
            blocks = addItem(
              blocks,
              newItem(
                { id: `e${exercise}`, name: `E${exercise++}`, archived: false, cover: null },
                nk,
              ),
            );
            break;
          case 3:
            if (item) blocks = removeItem(blocks, item.key);
            break;
          case 4:
            if (item) blocks = duplicateItem(blocks, item.key, nk);
            break;
          case 5:
            if (item) blocks = updateItem(blocks, item.key, { restSeconds: 30, notes: "n" });
            break;
          case 6:
            if (item) blocks = addSet(blocks, item.key, nk);
            break;
          case 7:
            if (item) blocks = addSet(blocks, item.key, nk);
            break;
          case 8:
            if (item && item.sets.length > 0) {
              blocks = removeSet(blocks, item.key, pick(item.sets)!.key);
            }
            break;
          case 9:
            if (item && item.sets.length > 0) {
              blocks = updateSet(blocks, item.key, item.sets[0].key, { reps: step });
            }
            break;
          case 10:
          case 11:
            if (block) blocks = groupWithNext(blocks, block.key, nk);
            break;
          case 12: {
            const g = pick(groups);
            if (g) blocks = ungroup(blocks, g.key);
            break;
          }
          case 13: {
            const g = pick(groups);
            if (g && g.kind === "group") {
              blocks = reorderGroupItems(blocks, g.key, [...g.items].reverse());
              blocks = updateGroupRest(blocks, g.key, step);
            }
            break;
          }
          default: {
            // the UI gates on can*; helpers must still be safe when called anyway
            if (item && canRemoveSet(blocks, item.key) && item.sets.length > 0) {
              blocks = removeSet(blocks, item.key, item.sets[item.sets.length - 1].key);
            }
          }
        }
        deepFreeze(blocks);
        assertValid(blocks);
        expect(itemCount(blocks)).toBeLessThanOrEqual(MAX_ITEMS);
        for (const b of blocks) {
          if (b.kind !== "group") {
            expect(b.item.sets.length).toBeLessThanOrEqual(MAX_SETS);
            continue;
          }
          expect(b.items.length).toBeGreaterThanOrEqual(GROUP_MIN);
          expect(b.items.length).toBeLessThanOrEqual(GROUP_MAX);
          expect(new Set(b.items.map((i) => i.sets.length)).size).toBe(1);
          expect(b.items[0].sets.length).toBeGreaterThanOrEqual(1);
          expect(b.items[0].sets.length).toBeLessThanOrEqual(MAX_SETS);
        }
        const keys = blocks.map((b) => b.key);
        expect(new Set(keys).size).toBe(keys.length);
      }
    });
  }

  it("never mutates its arguments", () => {
    const [a, b, c] = [mk("a", [{ reps: 1 }, { reps: 2 }]), mk("b"), mk("c")];
    const blocks = deepFreeze([single(a), single(b), single(c)]);
    const grouped = deepFreeze(groupWithNext(blocks, a.key, nk));
    const results = [
      addItem(blocks, mk("z")),
      removeItem(grouped, b.key),
      duplicateItem(grouped, a.key, nk),
      updateItem(grouped, a.key, { notes: "x", restSeconds: 5 }),
      updateSet(grouped, a.key, a.sets[0].key, { reps: 99 }),
      addSet(grouped, a.key, nk),
      removeSet(grouped, a.key, a.sets[0].key),
      updateGroupRest(grouped, grouped[0].key, 10),
      reorderGroupItems(grouped, grouped[0].key, [b, a]),
      groupWithNext(grouped, grouped[0].key, nk),
      ungroup(grouped, grouped[0].key),
      toSaveBlocks(grouped),
    ];
    expect(results).toHaveLength(12);
  });
});
