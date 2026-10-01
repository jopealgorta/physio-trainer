import { describe, expect, it } from "vitest";

import {
  appendEntry,
  changedEntries,
  copyEntry,
  dayHasRoom,
  groupByDay,
  isWeekday,
  MAX_ENTRIES_PER_DAY,
  moveEntry,
  normalizeEntries,
  routineUseCounts,
  summarizeWeek,
  weekdayName,
  type PlacedEntry,
} from "./plans";

const e = (id: string, weekday: number, position: number): PlacedEntry => ({
  id,
  weekday,
  position,
});
const layout = (entries: PlacedEntry[]) =>
  groupByDay(entries).map((day) => day.map((entry) => entry.id));

describe("weekdays", () => {
  it("accepts only ISO weekdays 1-7", () => {
    expect([0, 1, 7, 8, 1.5, "1", null].map(isWeekday)).toEqual([
      false,
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it("names weekdays in the active locale, Monday first", () => {
    expect(weekdayName("en", 1)).toBe("Monday");
    expect(weekdayName("en", 7)).toBe("Sunday");
    expect(weekdayName("es", 1)).toBe("lunes");
    expect(weekdayName("es", 3, "short")).toMatch(/^mi/);
  });
});

describe("groupByDay", () => {
  it("buckets by weekday and orders by position", () => {
    const days = layout([e("b", 1, 1), e("a", 1, 0), e("c", 7, 0)]);
    expect(days[0]).toEqual(["a", "b"]);
    expect(days[6]).toEqual(["c"]);
    expect(days[1]).toEqual([]);
  });

  it("ignores entries on an invalid weekday", () => {
    expect(layout([e("a", 9, 0)]).flat()).toEqual([]);
  });
});

describe("normalizeEntries", () => {
  it("closes gaps in positions", () => {
    expect(normalizeEntries([e("a", 2, 4), e("b", 2, 9)]).map((x) => x.position)).toEqual([0, 1]);
  });
});

describe("moveEntry", () => {
  const base = [e("a", 1, 0), e("b", 1, 1), e("c", 1, 2), e("d", 2, 0)];

  it("reorders within a day", () => {
    const next = moveEntry(base, "a", 1, 2)!;
    expect(layout(next)[0]).toEqual(["b", "c", "a"]);
    expect(next.filter((x) => x.weekday === 1).map((x) => x.position)).toEqual([0, 1, 2]);
  });

  it("moves to another day at an index and repositions both days", () => {
    const next = moveEntry(base, "b", 2, 0)!;
    expect(layout(next)[0]).toEqual(["a", "c"]);
    expect(layout(next)[1]).toEqual(["b", "d"]);
    expect(next.find((x) => x.id === "b")!.weekday).toBe(2);
  });

  it("clamps the index to the end of the day", () => {
    expect(layout(moveEntry(base, "a", 2, 99)!)[1]).toEqual(["d", "a"]);
    expect(layout(moveEntry(base, "c", 1, -3)!)[0]).toEqual(["c", "a", "b"]);
  });

  it("returns null for an unknown entry or invalid weekday", () => {
    expect(moveEntry(base, "zzz", 2, 0)).toBeNull();
    expect(moveEntry(base, "a", 8, 0)).toBeNull();
  });

  it("refuses a move into a full day but allows reordering a full day", () => {
    const full = Array.from({ length: MAX_ENTRIES_PER_DAY }, (_, i) => e(`f${i}`, 3, i));
    const all = [...full, e("x", 1, 0)];
    expect(moveEntry(all, "x", 3, 0)).toBeNull();
    expect(moveEntry(all, "f0", 3, 5)).not.toBeNull();
  });

  it("does not mutate its input", () => {
    const copy = structuredClone(base);
    moveEntry(base, "a", 2, 0);
    expect(base).toEqual(copy);
  });
});

describe("copyEntry", () => {
  const base = [e("a", 1, 0), e("b", 2, 0)];

  it("appends a copy at the end of the target day", () => {
    const next = copyEntry(base, "a", 2, "a2")!;
    expect(layout(next)[1]).toEqual(["b", "a2"]);
    expect(layout(next)[0]).toEqual(["a"]);
  });

  it("can copy onto the same day", () => {
    expect(layout(copyEntry(base, "a", 1, "a2")!)[0]).toEqual(["a", "a2"]);
  });

  it("returns null when the day is full, the entry is unknown or the weekday invalid", () => {
    const full = Array.from({ length: MAX_ENTRIES_PER_DAY }, (_, i) => e(`f${i}`, 3, i));
    expect(copyEntry([...full, e("x", 1, 0)], "x", 3, "x2")).toBeNull();
    expect(copyEntry(base, "nope", 2, "n")).toBeNull();
    expect(copyEntry(base, "a", 0, "n")).toBeNull();
  });
});

describe("appendEntry and dayHasRoom", () => {
  it("appends to a day with room and refuses a full day", () => {
    const full = Array.from({ length: MAX_ENTRIES_PER_DAY }, (_, i) => e(`f${i}`, 3, i));
    expect(dayHasRoom(full, 3)).toBe(false);
    expect(dayHasRoom(full, 4)).toBe(true);
    expect(appendEntry(full, e("n", 3, 0))).toBeNull();
    expect(layout(appendEntry([e("a", 4, 0)], e("n", 4, 0))!)[3]).toEqual(["a", "n"]);
  });
});

describe("changedEntries", () => {
  it("lists entries whose day or position changed, and new ones", () => {
    const before = [e("a", 1, 0), e("b", 1, 1), e("c", 2, 0)];
    const after = moveEntry(before, "a", 1, 1)!;
    expect(changedEntries(before, after).map((x) => x.id)).toEqual(["b", "a"]);
    expect(changedEntries(before, [...before, e("n", 5, 0)]).map((x) => x.id)).toEqual(["n"]);
  });
});

describe("summarizeWeek", () => {
  it("counts sessions per day, total exercises and active days", () => {
    const summary = summarizeWeek([
      { weekday: 1, exerciseCount: 5 },
      { weekday: 1, exerciseCount: 3 },
      { weekday: 4, exerciseCount: 5 },
    ]);
    expect(summary.sessionsPerDay).toEqual([2, 0, 0, 1, 0, 0, 0]);
    expect(summary).toMatchObject({ totalSessions: 3, totalExercises: 13, activeDays: 2 });
  });

  it("is all zeros for an empty week", () => {
    expect(summarizeWeek([])).toEqual({
      sessionsPerDay: [0, 0, 0, 0, 0, 0, 0],
      totalSessions: 0,
      totalExercises: 0,
      activeDays: 0,
    });
  });
});

describe("routineUseCounts", () => {
  it("counts entries per routine", () => {
    const counts = routineUseCounts([
      { routineId: "r1" },
      { routineId: "r2" },
      { routineId: "r1" },
    ]);
    expect(counts.get("r1")).toBe(2);
    expect(counts.get("r2")).toBe(1);
  });
});
