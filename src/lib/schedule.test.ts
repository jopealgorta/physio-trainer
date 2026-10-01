import { describe, expect, it } from "vitest";

import { isActiveOn, nextStart, scheduleState, scheduleStateNow } from "./schedule";

const item = (
  status: "draft" | "active" | "archived",
  startsOn: string | null,
  endsOn: string | null,
) => ({ status, startsOn, endsOn });

describe("scheduleState", () => {
  it("is inactive unless the status is active", () => {
    expect(scheduleState(item("draft", null, null), "2026-10-01")).toBe("inactive");
    expect(scheduleState(item("archived", "2026-09-01", "2026-12-01"), "2026-10-01")).toBe(
      "inactive",
    );
  });

  it("is active with no bounds", () => {
    expect(scheduleState(item("active", null, null), "2026-10-01")).toBe("active");
  });

  it("treats both bounds as inclusive", () => {
    const window = item("active", "2026-10-01", "2026-10-31");
    expect(scheduleState(window, "2026-09-30")).toBe("upcoming");
    expect(scheduleState(window, "2026-10-01")).toBe("active");
    expect(scheduleState(window, "2026-10-31")).toBe("active");
    expect(scheduleState(window, "2026-11-01")).toBe("ended");
  });

  it("handles a single null bound", () => {
    expect(scheduleState(item("active", "2026-10-05", null), "2026-10-04")).toBe("upcoming");
    expect(scheduleState(item("active", "2026-10-05", null), "2099-01-01")).toBe("active");
    expect(scheduleState(item("active", null, "2026-10-05"), "2026-10-05")).toBe("active");
    expect(scheduleState(item("active", null, "2026-10-05"), "2026-10-06")).toBe("ended");
  });

  it("handles a one-day window", () => {
    const day = item("active", "2026-10-05", "2026-10-05");
    expect(scheduleState(day, "2026-10-05")).toBe("active");
    expect(scheduleState(day, "2026-10-06")).toBe("ended");
  });
});

describe("isActiveOn", () => {
  it("is true only for the active state", () => {
    expect(isActiveOn(item("active", null, "2026-10-01"), "2026-10-01")).toBe(true);
    expect(isActiveOn(item("active", null, "2026-10-01"), "2026-10-02")).toBe(false);
    expect(isActiveOn(item("draft", null, null), "2026-10-01")).toBe(false);
  });
});

describe("scheduleStateNow", () => {
  // 2026-10-01 23:30 UTC is already 2 October in Auckland and still 1 October in Los Angeles.
  const now = new Date("2026-10-01T23:30:00Z");
  const window = item("active", "2026-10-02", "2026-10-02");

  it("uses the calendar day in the given time zone", () => {
    expect(scheduleStateNow(window, "Pacific/Auckland", now)).toBe("active");
    expect(scheduleStateNow(window, "America/Los_Angeles", now)).toBe("upcoming");
    expect(scheduleStateNow(window, "UTC", now)).toBe("upcoming");
  });

  it("flips at local midnight", () => {
    const ends = item("active", null, "2026-10-01");
    expect(
      scheduleStateNow(ends, "America/Argentina/Buenos_Aires", new Date("2026-10-02T02:59:00Z")),
    ).toBe("active");
    expect(
      scheduleStateNow(ends, "America/Argentina/Buenos_Aires", new Date("2026-10-02T03:00:00Z")),
    ).toBe("ended");
  });
});

describe("nextStart", () => {
  it("returns the earliest future start of active items", () => {
    const items = [
      item("active", "2026-10-20", null),
      item("active", "2026-10-10", null),
      item("draft", "2026-10-05", null),
      item("active", "2026-09-01", null),
      item("active", null, null),
    ];
    expect(nextStart(items, "2026-10-01")).toBe("2026-10-10");
  });

  it("returns null when nothing is upcoming", () => {
    expect(nextStart([item("active", "2026-09-01", null)], "2026-10-01")).toBeNull();
    expect(nextStart([], "2026-10-01")).toBeNull();
  });
});
