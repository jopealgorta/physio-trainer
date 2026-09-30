import { describe, expect, it } from "vitest";

import { validateStructure, type StructureItem } from "./routine-structure";

const single = (setCount = 1): StructureItem => ({ groupKey: null, restSeconds: null, setCount });
const member = (
  groupKey: string,
  setCount = 3,
  restSeconds: number | null = null,
): StructureItem => ({
  groupKey,
  restSeconds,
  setCount,
});
const g = (key: string) => ({ key, restSeconds: 60 });

describe("validateStructure", () => {
  it("accepts a flat list and a well-formed superset", () => {
    expect(validateStructure([], [single(0), single(3)])).toEqual([]);
    expect(validateStructure([g("a")], [single(), member("a"), member("a"), single()])).toEqual([]);
    expect(validateStructure([g("a")], [member("a"), member("a"), member("a")])).toEqual([]);
  });
  it("rejects groups of one or four", () => {
    expect(validateStructure([g("a")], [member("a")])).toContain("groupSize");
    expect(
      validateStructure(
        [g("a")],
        [1, 2, 3, 4].map(() => member("a")),
      ),
    ).toContain("groupSize");
  });
  it("rejects non-consecutive members", () => {
    expect(validateStructure([g("a")], [member("a"), single(), member("a")])).toContain(
      "groupNotConsecutive",
    );
  });
  it("rejects unequal or empty set counts", () => {
    expect(validateStructure([g("a")], [member("a", 3), member("a", 2)])).toContain(
      "groupSetsMismatch",
    );
    expect(validateStructure([g("a")], [member("a", 0), member("a", 0)])).toContain(
      "groupNeedsSets",
    );
  });
  it("rejects rest on grouped items", () => {
    expect(validateStructure([g("a")], [member("a", 3, 30), member("a")])).toContain(
      "groupItemRest",
    );
  });
  it("rejects unknown, unused and duplicate group keys", () => {
    expect(validateStructure([], [member("x"), member("x")])).toContain("unknownGroup");
    expect(validateStructure([g("a")], [single()])).toContain("unusedGroup");
    expect(validateStructure([g("a"), g("a")], [member("a"), member("a")])).toContain(
      "duplicateGroup",
    );
  });
  it("reports each issue once", () => {
    const issues = validateStructure([], [member("x"), member("y"), member("x")]);
    expect(issues).toEqual(["unknownGroup"]);
  });
});
