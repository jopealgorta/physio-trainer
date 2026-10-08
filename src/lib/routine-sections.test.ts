import { beforeEach, describe, expect, it } from "vitest";

import { newItem, type EditorBlock, type EditorItem, type LoadedItem } from "./routine-editor";
import {
  addItemToLast,
  addSection,
  allBlocks,
  duplicateItemIn,
  fromLoadedSections,
  moveBlockToSection,
  moveSection,
  removeSection,
  renameSection,
  reorderSections,
  sectionKeyOfBlock,
  toSaveSections,
  totalItems,
  updateSectionBlocks,
  visibleSections,
  type EditorSection,
} from "./routine-sections";
import { EMPTY_ITEM_PRESCRIPTION } from "./prescription";
import { MAX_ITEMS, MAX_SECTIONS, SECTION_NAME_MAX } from "./routines";

let n = 0;
const nk = () => `k${++n}`;
beforeEach(() => {
  n = 0;
});

const mk = (name: string): EditorItem =>
  newItem({ id: `ex-${name}`, name, kind: "strength", archived: false, cover: null }, nk);
const single = (item: EditorItem): EditorBlock => ({ kind: "single", key: item.key, item });
const superset = (key: string, items: EditorItem[]): EditorBlock => ({
  kind: "group",
  key,
  restSeconds: 30,
  items,
});
const sec = (key: string, blocks: EditorBlock[] = []): EditorSection => ({
  key,
  name: key,
  blocks,
});
const fill = (count: number) => Array.from({ length: count }, (_, i) => single(mk(`x${i}`)));

describe("section list helpers", () => {
  it("addSection trims, rejects blank and over-long names, stops at the maximum", () => {
    const one = [sec("a")];
    const added = addSection(one, "  Warm-up  ", nk);
    expect(added).toHaveLength(2);
    expect(added[1].name).toBe("Warm-up");
    expect(added[1].blocks).toEqual([]);
    expect(addSection(one, "  ", nk)).toBe(one);
    expect(addSection(one, "x".repeat(SECTION_NAME_MAX + 1), nk)).toBe(one);
    expect(addSection(one, "x".repeat(SECTION_NAME_MAX), nk)).toHaveLength(2);
    const full = Array.from({ length: MAX_SECTIONS }, (_, i) => sec(`s${i}`));
    expect(addSection(full, "More", nk)).toBe(full);
  });

  it("renameSection trims and ignores invalid names or unknown keys", () => {
    const list = [sec("a"), sec("b")];
    expect(renameSection(list, "b", " Main ")[1].name).toBe("Main");
    expect(renameSection(list, "b", " ")).toBe(list);
    expect(renameSection(list, "zz", "Main")).toBe(list);
  });

  it("removeSection drops the section with its blocks but refuses the only one", () => {
    const list = [sec("a", fill(2)), sec("b", fill(1))];
    const out = removeSection(list, "a");
    expect(out.map((s) => s.key)).toEqual(["b"]);
    expect(totalItems(out)).toBe(1);
    expect(removeSection(out, "b")).toBe(out);
    expect(removeSection(list, "zz")).toBe(list);
  });

  it("moveSection swaps with a neighbour and stops at the ends", () => {
    const list = [sec("a"), sec("b"), sec("c")];
    expect(moveSection(list, "b", -1).map((s) => s.key)).toEqual(["b", "a", "c"]);
    expect(moveSection(list, "b", 1).map((s) => s.key)).toEqual(["a", "c", "b"]);
    expect(moveSection(list, "a", -1)).toBe(list);
    expect(moveSection(list, "c", 1)).toBe(list);
  });

  it("reorderSections accepts the same members and rejects anything else", () => {
    const list = [sec("a"), sec("b"), sec("c")];
    expect(reorderSections(list, [list[2], list[0], list[1]]).map((s) => s.key)).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(reorderSections(list, [list[0], list[1]])).toBe(list);
    expect(reorderSections(list, [list[0], list[0], list[1]])).toBe(list);
    expect(reorderSections(list, [list[0], list[1], sec("zz")])).toBe(list);
  });

  it("updateSectionBlocks applies fn to one section and keeps identity on no-ops", () => {
    const list = [sec("a", fill(1)), sec("b")];
    const out = updateSectionBlocks(list, "b", (blocks) => [...blocks, ...fill(1)]);
    expect(out[0]).toBe(list[0]);
    expect(out[1].blocks).toHaveLength(1);
    expect(updateSectionBlocks(list, "b", (blocks) => blocks)).toBe(list);
    expect(updateSectionBlocks(list, "zz", (blocks) => blocks)).toBe(list);
  });
});

describe("moveBlockToSection", () => {
  it("moves a superset whole, preserving members and the rest of both sections", () => {
    const a = mk("a");
    const b = mk("b");
    const c = mk("c");
    const d = mk("d");
    const g = superset("g1", [a, b]);
    const list = [sec("s1", [single(c), g]), sec("s2", [single(d)])];
    const out = moveBlockToSection(list, "g1", "s2");
    expect(out[0].blocks.map((x) => x.key)).toEqual([c.key]);
    expect(out[1].blocks.map((x) => x.key)).toEqual([d.key, "g1"]);
    expect(out[1].blocks[1]).toBe(g);
    expect(sectionKeyOfBlock(out, "g1")).toBe("s2");
  });

  it("moves a single to index 0 of another section", () => {
    const a = mk("a");
    const d = mk("d");
    const list = [sec("s1", [single(a)]), sec("s2", [single(d)])];
    const out = moveBlockToSection(list, a.key, "s2", 0);
    expect(out[0].blocks).toEqual([]);
    expect(out[1].blocks.map((x) => x.key)).toEqual([a.key, d.key]);
  });

  it("returns the same array for unknown keys", () => {
    const list = [sec("s1", fill(1))];
    expect(moveBlockToSection(list, "nope", "s1")).toBe(list);
    expect(moveBlockToSection(list, list[0].blocks[0].key, "nope")).toBe(list);
    expect(sectionKeyOfBlock(list, "nope")).toBeNull();
  });
});

describe("item caps across sections", () => {
  it("addItemToLast appends to the last section", () => {
    const list = [sec("s1"), sec("s2", fill(1))];
    const out = addItemToLast(list, mk("new"));
    expect(out[0]).toBe(list[0]);
    expect(out[1].blocks).toHaveLength(2);
  });

  it("addItemToLast and duplicateItemIn are no-ops at 50 items spread over two sections", () => {
    const list = [sec("s1", fill(30)), sec("s2", fill(MAX_ITEMS - 30))];
    expect(totalItems(list)).toBe(MAX_ITEMS);
    expect(addItemToLast(list, mk("new"))).toBe(list);
    const itemKey = allBlocks(list)[0].key;
    expect(duplicateItemIn(list, itemKey, nk)).toBe(list);
  });

  it("duplicateItemIn duplicates inside the owning section", () => {
    const a = mk("a");
    const list = [sec("s1"), sec("s2", [single(a)])];
    const out = duplicateItemIn(list, a.key, nk);
    expect(out[0]).toBe(list[0]);
    expect(out[1].blocks).toHaveLength(2);
    expect(duplicateItemIn(list, "nope", nk)).toBe(list);
  });
});

describe("toSaveSections", () => {
  it("lists items section by section with their sectionKey and keeps group keys", () => {
    const a = mk("a");
    const b = mk("b");
    const c = mk("c");
    const list = [sec("s1", [superset("g1", [a, b])]), sec("s2", [single(c)])];
    const out = toSaveSections(list);
    expect(out.sections).toEqual([
      { key: "s1", name: "s1" },
      { key: "s2", name: "s2" },
    ]);
    expect(out.groups).toEqual([{ key: "g1", restSeconds: 30 }]);
    expect(out.items.map((i) => [i.exerciseId, i.sectionKey, i.groupKey])).toEqual([
      ["ex-a", "s1", "g1"],
      ["ex-b", "s1", "g1"],
      ["ex-c", "s2", null],
    ]);
  });
});

describe("fromLoadedSections", () => {
  const loaded = (name: string, groupId: string | null, sectionId: string | null): LoadedItem => ({
    ...EMPTY_ITEM_PRESCRIPTION,
    id: `i-${name}`,
    exerciseId: `ex-${name}`,
    exerciseKind: "strength",
    exerciseName: name,
    exerciseArchived: false,
    cover: null,
    groupId,
    sectionId,
    sets: [
      {
        reps: 10,
        repsMax: null,
        durationSeconds: null,
        load: null,
        distanceMeters: null,
        intensity: null,
      },
    ],
  });

  it("buckets items by section, keeps empty sections and section order", () => {
    const out = fromLoadedSections(
      [loaded("a", null, "s1"), loaded("b", null, "s3")],
      [],
      [
        { id: "s1", name: "One" },
        { id: "s2", name: "Two" },
        { id: "s3", name: "Three" },
      ],
      "Main",
      nk,
    );
    expect(out.map((s) => s.name)).toEqual(["One", "Two", "Three"]);
    expect(out.map((s) => totalItems([s]))).toEqual([1, 0, 1]);
    expect(new Set(out.map((s) => s.key)).size).toBe(3);
  });

  it("puts items with a null section into the first section", () => {
    const out = fromLoadedSections(
      [loaded("a", null, null), loaded("b", null, "s2")],
      [],
      [
        { id: "s1", name: "One" },
        { id: "s2", name: "Two" },
      ],
      "Main",
      nk,
    );
    expect(totalItems([out[0]])).toBe(1);
    expect(totalItems([out[1]])).toBe(1);
  });

  it("with no sections yields one section named defaultName holding everything", () => {
    const out = fromLoadedSections(
      [loaded("a", null, null), loaded("b", null, null)],
      [],
      [],
      "Main",
      nk,
    );
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Main");
    expect(totalItems(out)).toBe(2);
    expect(fromLoadedSections([], [], [], "Main", nk)[0].blocks).toEqual([]);
  });

  it("never lets a group run cross a section boundary", () => {
    const out = fromLoadedSections(
      [loaded("a", "g1", "s1"), loaded("b", "g1", "s2")],
      [{ id: "g1", restSeconds: 45 }],
      [
        { id: "s1", name: "One" },
        { id: "s2", name: "Two" },
      ],
      "Main",
      nk,
    );
    expect(out[0].blocks).toHaveLength(1);
    expect(out[1].blocks).toHaveLength(1);
    expect(out[0].blocks[0].kind).toBe("single");
    expect(out[1].blocks[0].kind).toBe("single");
  });

  it("keeps a group inside one section", () => {
    const out = fromLoadedSections(
      [loaded("a", "g1", "s1"), loaded("b", "g1", "s1")],
      [{ id: "g1", restSeconds: 45 }],
      [{ id: "s1", name: "One" }],
      "Main",
      nk,
    );
    expect(out[0].blocks[0]).toMatchObject({ kind: "group", key: "g1", restSeconds: 45 });
  });
});

describe("visibleSections", () => {
  it("drops empty sections and shows headings only with two or more non-empty", () => {
    const empty = { blocks: [] as number[] };
    const full = { blocks: [1] };
    expect(visibleSections([empty, full])).toEqual({ sections: [full], headings: false });
    expect(visibleSections([full, empty, { blocks: [2] }]).headings).toBe(true);
    expect(visibleSections([empty])).toEqual({ sections: [], headings: false });
  });
});
