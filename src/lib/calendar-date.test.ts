import { describe, expect, it } from "vitest";

import {
  ageInYears,
  CALENDAR_DATE_FORMAT,
  calendarDateToDate,
  isCalendarDate,
  todayIn,
} from "./calendar-date";

describe("todayIn", () => {
  it("uses the given time zone's calendar day", () => {
    const now = new Date("2026-09-29T02:30:00Z");
    expect(todayIn("UTC", now)).toBe("2026-09-29");
    expect(todayIn("America/Montevideo", now)).toBe("2026-09-28"); // UTC-3
    expect(todayIn("Pacific/Auckland", now)).toBe("2026-09-29"); // UTC+13
  });
});

describe("isCalendarDate", () => {
  it.each(["2000-02-29", "1990-12-31", "1900-01-01"])("accepts %s", (v) =>
    expect(isCalendarDate(v)).toBe(true),
  );
  it.each([
    "2001-02-29",
    "2026-13-01",
    "2026-00-10",
    "2026-04-31",
    "1899-12-31",
    "26-01-01",
    "",
    "2026-1-1",
    "abc",
  ])("rejects %s", (v) => expect(isCalendarDate(v)).toBe(false));
});

describe("ageInYears", () => {
  const now = new Date("2026-09-29T12:00:00Z");
  it("counts completed years", () => {
    expect(ageInYears("1990-09-29", "UTC", now)).toBe(36); // birthday today
    expect(ageInYears("1990-09-30", "UTC", now)).toBe(35); // birthday tomorrow
    expect(ageInYears("1990-09-28", "UTC", now)).toBe(36);
  });
  it("handles Feb 29 birthdays (birthday reached on Mar 1 in common years)", () => {
    expect(ageInYears("2000-02-29", "UTC", new Date("2026-02-28T12:00:00Z"))).toBe(25);
    expect(ageInYears("2000-02-29", "UTC", new Date("2026-03-01T12:00:00Z"))).toBe(26);
  });
  it("uses the time zone's day, not UTC's", () => {
    const edge = new Date("2026-09-29T02:00:00Z"); // still Sep 28 in Montevideo
    expect(ageInYears("1990-09-29", "UTC", edge)).toBe(36);
    expect(ageInYears("1990-09-29", "America/Montevideo", edge)).toBe(35);
  });
  it("returns null for invalid or future dates", () => {
    expect(ageInYears("nope", "UTC", now)).toBeNull();
    expect(ageInYears("2030-01-01", "UTC", now)).toBeNull();
  });
});

describe("calendarDateToDate", () => {
  it("is UTC midnight of that day, so UTC formatting never shifts it", () => {
    const date = calendarDateToDate("1990-09-29");
    expect(date.toISOString()).toBe("1990-09-29T00:00:00.000Z");
    expect(CALENDAR_DATE_FORMAT.timeZone).toBe("UTC");
    expect(new Intl.DateTimeFormat("en", CALENDAR_DATE_FORMAT).format(date)).toBe("Sep 29, 1990");
  });
});
