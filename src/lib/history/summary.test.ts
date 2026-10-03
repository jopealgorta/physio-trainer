import { describe, expect, it } from "vitest";
import type { PlanDiff, RoutineDiff } from "./diff";
import { isEmptySummary, summarizePlan, summarizeRoutine } from "./summary";

const routineItem = (
  over: Partial<RoutineDiff["items"][number]>,
): RoutineDiff["items"][number] => ({
  status: "unchanged",
  moved: false,
  before: null,
  after: null,
  changes: [],
  sets: [],
  ...over,
});

describe("summarizeRoutine", () => {
  it("counts +2 and reps changed on one item", () => {
    const diff: RoutineDiff = {
      header: [],
      items: [
        routineItem({ status: "added" }),
        routineItem({ status: "added" }),
        routineItem({
          status: "changed",
          sets: [
            { index: 0, kind: "changed", changes: [{ field: "reps", from: 10, to: 12 }] },
            { index: 1, kind: "changed", changes: [{ field: "reps", from: 10, to: 12 }] },
          ],
        }),
        routineItem({}),
      ],
    };
    expect(summarizeRoutine(diff)).toEqual({
      added: 2,
      removed: 0,
      moved: 0,
      changed: 1,
      fields: { reps: 1 },
      header: [],
    });
  });

  it("counts item fields, removed and moved", () => {
    const diff: RoutineDiff = {
      header: [],
      items: [
        routineItem({ status: "removed" }),
        routineItem({ moved: true }),
        routineItem({
          status: "changed",
          changes: [{ field: "notes", from: null, to: "x" }],
        }),
      ],
    };
    expect(summarizeRoutine(diff)).toEqual({
      added: 0,
      removed: 1,
      moved: 1,
      changed: 1,
      fields: { notes: 1 },
      header: [],
    });
  });

  it("records header-only changes", () => {
    const diff: RoutineDiff = {
      header: [{ field: "name", from: "a", to: "b" }],
      items: [routineItem({})],
    };
    const summary = summarizeRoutine(diff);
    expect(summary.header).toEqual(["name"]);
    expect(isEmptySummary(summary)).toBe(false);
  });
});

describe("summarizePlan", () => {
  it("counts label and routine swaps", () => {
    const entry = (over: Partial<PlanDiff["entries"][number]>): PlanDiff["entries"][number] => ({
      status: "unchanged",
      moved: false,
      before: null,
      after: null,
      changes: [],
      ...over,
    });
    const diff: PlanDiff = {
      header: [],
      days: [],
      entries: [
        entry({ status: "changed", changes: [{ field: "label", from: null, to: "AM" }] }),
        entry({ status: "changed", changes: [{ field: "routine", from: "r1", to: "r2" }] }),
        entry({ moved: true }),
      ],
    };
    expect(summarizePlan(diff)).toEqual({
      added: 0,
      removed: 0,
      moved: 1,
      changed: 2,
      fields: { label: 1, routine: 1 },
      header: [],
    });
  });
});

describe("summarizePlan day notes", () => {
  it("counts changed day notes under dayNotes", () => {
    const diff: PlanDiff = {
      header: [],
      entries: [],
      days: [
        { weekday: 1, before: null, after: "a" },
        { weekday: 2, before: "b", after: null },
      ],
    };
    const summary = summarizePlan(diff);
    expect(summary.fields).toEqual({ dayNotes: 2 });
    expect(isEmptySummary(summary)).toBe(false);
  });
});

describe("isEmptySummary", () => {
  it("is true only when nothing changed", () => {
    const empty = { added: 0, removed: 0, moved: 0, changed: 0, fields: {}, header: [] };
    expect(isEmptySummary(empty)).toBe(true);
    expect(isEmptySummary({ ...empty, moved: 1 })).toBe(false);
  });
});
