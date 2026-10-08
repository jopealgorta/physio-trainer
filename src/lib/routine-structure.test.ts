import { describe, expect, it } from "vitest";

import { validateStructure, type StructureGroup, type StructureItem } from "./routine-structure";

const S = { key: "s" };
const check = (groups: StructureGroup[], items: StructureItem[], sections = [S]) =>
  validateStructure(groups, items, sections);
const single = (setCount = 1, sectionKey = "s"): StructureItem => ({
  groupKey: null,
  restSeconds: null,
  setCount,
  sectionKey,
});
const member = (
  groupKey: string,
  setCount = 3,
  restSeconds: number | null = null,
  sectionKey = "s",
): StructureItem => ({
  groupKey,
  restSeconds,
  setCount,
  sectionKey,
});
const g = (key: string) => ({ key, restSeconds: 60 });

describe("validateStructure", () => {
  it("accepts a flat list and a well-formed superset", () => {
    expect(check([], [single(0), single(3)])).toEqual([]);
    expect(check([g("a")], [single(), member("a"), member("a"), single()])).toEqual([]);
    expect(check([g("a")], [member("a"), member("a"), member("a")])).toEqual([]);
  });
  it("rejects groups of one or four", () => {
    expect(check([g("a")], [member("a")])).toContain("groupSize");
    expect(
      check(
        [g("a")],
        [1, 2, 3, 4].map(() => member("a")),
      ),
    ).toContain("groupSize");
  });
  it("rejects non-consecutive members", () => {
    expect(check([g("a")], [member("a"), single(), member("a")])).toContain("groupNotConsecutive");
  });
  it("rejects unequal or empty set counts", () => {
    expect(check([g("a")], [member("a", 3), member("a", 2)])).toContain("groupSetsMismatch");
    expect(check([g("a")], [member("a", 0), member("a", 0)])).toContain("groupNeedsSets");
  });
  it("rejects rest on grouped items", () => {
    expect(check([g("a")], [member("a", 3, 30), member("a")])).toContain("groupItemRest");
  });
  it("rejects unknown, unused and duplicate group keys", () => {
    expect(check([], [member("x"), member("x")])).toContain("unknownGroup");
    expect(check([g("a")], [single()])).toContain("unusedGroup");
    expect(check([g("a"), g("a")], [member("a"), member("a")])).toContain("duplicateGroup");
  });
  it("reports each issue once", () => {
    const issues = check([], [member("x"), member("y"), member("x")]);
    expect(issues).toEqual(["unknownGroup"]);
  });
  describe("sections", () => {
    const two = [{ key: "s" }, { key: "t" }];
    it("accepts items in section order and empty sections", () => {
      expect(check([], [single(1, "s"), single(1, "t")], two)).toEqual([]);
      expect(check([], [single(1, "t")], two)).toEqual([]);
      expect(check([], [], two)).toEqual([]);
    });
    it("rejects an unknown section", () => {
      expect(check([], [single(1, "zzz")])).toContain("unknownSection");
    });
    it("rejects duplicate section keys", () => {
      expect(check([], [single()], [{ key: "s" }, { key: "s" }])).toContain("duplicateSection");
    });
    it("rejects items out of section order", () => {
      expect(check([], [single(1, "t"), single(1, "s")], two)).toContain("sectionOrder");
    });
    it("rejects a group spanning sections", () => {
      expect(
        check([g("a")], [member("a", 3, null, "s"), member("a", 3, null, "t")], two),
      ).toContain("groupSpansSections");
    });
  });
});
