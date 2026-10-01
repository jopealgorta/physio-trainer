import { describe, expect, it } from "vitest";

import { distinctRoutineIds, parseListTab, remapEntries, withSuffix } from "./templates";

describe("parseListTab", () => {
  it("accepts templates and defaults everything else to customers", () => {
    expect(parseListTab("templates")).toBe("templates");
    expect(parseListTab("customers")).toBe("customers");
    expect(parseListTab("bogus")).toBe("customers");
    expect(parseListTab(undefined)).toBe("customers");
  });
});

describe("distinctRoutineIds", () => {
  it("returns distinct ids in first-appearance order", () => {
    expect(
      distinctRoutineIds([{ routineId: "a" }, { routineId: "b" }, { routineId: "a" }]),
    ).toEqual(["a", "b"]);
    expect(distinctRoutineIds([])).toEqual([]);
  });
});

describe("remapEntries", () => {
  it("keeps other fields and maps shared ids to the same new id", () => {
    const entries = [
      { routineId: "a", day: 1 },
      { routineId: "b", day: 2 },
      { routineId: "a", day: 3 },
    ];
    const map = new Map([
      ["a", "A2"],
      ["b", "B2"],
    ]);
    expect(remapEntries(entries, map)).toEqual([
      { routineId: "A2", day: 1 },
      { routineId: "B2", day: 2 },
      { routineId: "A2", day: 3 },
    ]);
    expect(entries[0].routineId).toBe("a");
  });
  it("throws when an id has no mapping", () => {
    expect(() => remapEntries([{ routineId: "z" }], new Map())).toThrow();
  });
});

describe("withSuffix", () => {
  it("appends the suffix to a short name unchanged", () => {
    expect(withSuffix("Knee", " (copy)", 80)).toBe("Knee (copy)");
  });
  it("truncates the name, never the suffix", () => {
    const result = withSuffix("x".repeat(80), " (copy)", 80);
    expect(result).toHaveLength(80);
    expect(result.endsWith(" (copy)")).toBe(true);
  });
});
