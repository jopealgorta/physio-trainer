import { describe, expect, it } from "vitest";

import {
  PAIN_SCALE,
  dateForWeekday,
  loggedWeekdays,
  weekLogRange,
  isLoggableDate,
  loggableDates,
  normalizeComment,
  parsePain,
} from "./session-logs";

// 2026-10-02 is a Friday, 2026-10-05 a Monday.
describe("loggableDates / isLoggableDate", () => {
  it("allows today and yesterday only", () => {
    expect(loggableDates("2026-10-02")).toEqual(["2026-10-01", "2026-10-02"]);
    expect(isLoggableDate("2026-10-02", "2026-10-02")).toBe(true);
    expect(isLoggableDate("2026-10-01", "2026-10-02")).toBe(true);
    expect(isLoggableDate("2026-09-30", "2026-10-02")).toBe(false);
    expect(isLoggableDate("2026-10-03", "2026-10-02")).toBe(false);
  });

  it("crosses a month boundary", () => {
    expect(loggableDates("2026-11-01")).toEqual(["2026-10-31", "2026-11-01"]);
  });
});

describe("dateForWeekday", () => {
  it("maps a weekday to its date in the current Monday-Sunday week", () => {
    expect(dateForWeekday("2026-10-02", 1)).toBe("2026-09-28");
    expect(dateForWeekday("2026-10-02", 5)).toBe("2026-10-02");
    expect(dateForWeekday("2026-10-02", 7)).toBe("2026-10-04");
  });

  it("maps Sunday to yesterday on a Monday so yesterday can be logged", () => {
    expect(dateForWeekday("2026-10-05", 1)).toBe("2026-10-05");
    expect(dateForWeekday("2026-10-05", 7)).toBe("2026-10-04");
    expect(dateForWeekday("2026-10-05", 2)).toBe("2026-10-06");
  });
});

describe("parsePain", () => {
  it("accepts integers 0-10 and rejects the rest", () => {
    expect(PAIN_SCALE).toHaveLength(11);
    expect(parsePain("0")).toBe(0);
    expect(parsePain("10")).toBe(10);
    expect(parsePain(7)).toBe(7);
    expect(parsePain("")).toBeNull();
    expect(parsePain(null)).toBeNull();
    expect(parsePain("11")).toBeNull();
    expect(parsePain("-1")).toBeNull();
    expect(parsePain("3.5")).toBeNull();
    expect(parsePain("abc")).toBeNull();
  });
});

describe("normalizeComment", () => {
  it("trims and turns blank into null", () => {
    expect(normalizeComment("  knee ok  ")).toBe("knee ok");
    expect(normalizeComment("   ")).toBeNull();
    expect(normalizeComment(null)).toBeNull();
    expect(normalizeComment(undefined)).toBeNull();
  });
});

describe("weekLogRange", () => {
  it("spans the Monday-Sunday week, reaching back to yesterday on a Monday", () => {
    expect(weekLogRange("2026-10-02")).toEqual(["2026-09-28", "2026-10-04"]);
    expect(weekLogRange("2026-10-05")).toEqual(["2026-10-04", "2026-10-11"]);
  });
});

describe("loggedWeekdays", () => {
  const log = (performedOn: string, completed = true) => ({ performedOn, completed });

  it("lists the weekdays of this week that have a completed log", () => {
    expect(
      loggedWeekdays("2026-10-02", [
        log("2026-09-29"),
        log("2026-10-02"),
        log("2026-10-02"),
        log("2026-09-30", false),
        log("2026-09-20"),
      ]),
    ).toEqual([2, 5]);
  });

  it("counts yesterday's log on the Sunday of a Monday's strip", () => {
    expect(loggedWeekdays("2026-10-05", [log("2026-10-04"), log("2026-10-05")])).toEqual([1, 7]);
  });
});
