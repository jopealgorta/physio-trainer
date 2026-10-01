import { describe, expect, it } from "vitest";

import {
  addDays,
  endPredecessor,
  groupByChain,
  nextPhaseDefaults,
  validateWindow,
  windowsOverlap,
} from "./phases";

describe("addDays", () => {
  it("moves across month, year and leap days", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });
});

describe("validateWindow", () => {
  it("accepts empty and ordered windows", () => {
    expect(validateWindow({ startsOn: null, endsOn: null })).toBeNull();
    expect(validateWindow({ startsOn: "2026-10-01", endsOn: "2026-10-01" })).toBeNull();
    expect(validateWindow({ startsOn: null, endsOn: "2026-10-01" })).toBeNull();
  });

  it("rejects bad dates and a reversed window", () => {
    expect(validateWindow({ startsOn: "2026-13-01", endsOn: null })).toBe("startsInvalid");
    expect(validateWindow({ startsOn: null, endsOn: "nope" })).toBe("endsInvalid");
    expect(validateWindow({ startsOn: "2026-10-02", endsOn: "2026-10-01" })).toBe("endBeforeStart");
  });
});

describe("windowsOverlap", () => {
  const w = (startsOn: string | null, endsOn: string | null) => ({ startsOn, endsOn });

  it("treats bounds as inclusive", () => {
    expect(windowsOverlap(w("2026-10-01", "2026-10-10"), w("2026-10-10", null))).toBe(true);
    expect(windowsOverlap(w("2026-10-01", "2026-10-10"), w("2026-10-11", null))).toBe(false);
  });

  it("treats null bounds as open", () => {
    expect(windowsOverlap(w(null, null), w("2026-10-01", "2026-10-02"))).toBe(true);
    expect(windowsOverlap(w(null, "2026-09-30"), w("2026-10-01", null))).toBe(false);
    expect(windowsOverlap(w("2026-10-01", null), w("2020-01-01", "2026-10-01"))).toBe(true);
  });
});

describe("endPredecessor", () => {
  it("sets an empty end to the day before the new start", () => {
    expect(endPredecessor({ startsOn: "2026-09-01", endsOn: null }, "2026-10-08")).toEqual({
      ok: true,
      endsOn: "2026-10-07",
    });
  });

  it("shortens a later end and keeps an earlier one", () => {
    expect(endPredecessor({ startsOn: null, endsOn: "2026-12-31" }, "2026-10-08")).toEqual({
      ok: true,
      endsOn: "2026-10-07",
    });
    expect(endPredecessor({ startsOn: null, endsOn: "2026-10-01" }, "2026-10-08")).toEqual({
      ok: true,
      endsOn: "2026-10-01",
    });
  });

  it("refuses when the day before is earlier than the predecessor's start", () => {
    expect(endPredecessor({ startsOn: "2026-10-08", endsOn: null }, "2026-10-08")).toEqual({
      ok: false,
    });
    expect(endPredecessor({ startsOn: "2026-10-07", endsOn: null }, "2026-10-08")).toEqual({
      ok: true,
      endsOn: "2026-10-07",
    });
  });
});

describe("nextPhaseDefaults", () => {
  it("starts the day after the current end", () => {
    expect(nextPhaseDefaults({ endsOn: "2026-10-31" }, "2026-10-05")).toEqual({
      startsOn: "2026-11-01",
      endsOn: null,
      endCurrent: true,
    });
  });

  it("starts tomorrow when the current phase has no end", () => {
    expect(nextPhaseDefaults({ endsOn: null }, "2026-10-05").startsOn).toBe("2026-10-06");
  });
});

describe("groupByChain", () => {
  const row = (id: string, previousId: string | null, startsOn: string | null = null) => ({
    id,
    previousId,
    startsOn,
  });

  it("keeps unlinked items as single chains in input order", () => {
    expect(groupByChain([row("a", null), row("b", null)]).map((c) => c.map((r) => r.id))).toEqual([
      ["a"],
      ["b"],
    ]);
  });

  it("orders a chain by start date, nulls first", () => {
    const chains = groupByChain([
      row("c", "b", "2026-12-01"),
      row("a", null, null),
      row("b", "a", "2026-11-01"),
      row("z", null),
    ]);
    expect(chains.map((chain) => chain.map((r) => r.id))).toEqual([["a", "b", "c"], ["z"]]);
  });

  it("treats a missing predecessor as the start of a chain and groups branches", () => {
    const chains = groupByChain([
      row("child1", "gone", "2026-10-01"),
      row("root", null, "2026-09-01"),
      row("child2", "root", "2026-10-15"),
      row("child3", "root", "2026-10-10"),
    ]);
    expect(chains.map((chain) => chain.map((r) => r.id))).toEqual([
      ["child1"],
      ["root", "child3", "child2"],
    ]);
  });
});
