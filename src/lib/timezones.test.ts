import { describe, expect, it } from "vitest";

import { isValidTimeZone, normalizeTimeZone, timeZoneOptions } from "./timezones";

describe("normalizeTimeZone", () => {
  it("accepts IANA zones and UTC, returning the canonical name", () => {
    expect(normalizeTimeZone("Europe/Madrid")).toBe("Europe/Madrid");
    expect(normalizeTimeZone("UTC")).toBe("UTC");
    expect(normalizeTimeZone("utc")).toBe("UTC");
  });

  it.each(["Mars/Base", "", "not a zone"])("rejects %j", (value) => {
    expect(normalizeTimeZone(value)).toBeNull();
    expect(isValidTimeZone(value)).toBe(false);
  });
});

describe("timeZoneOptions", () => {
  const january = new Date("2026-01-15T12:00:00Z");

  it("lists UTC first, then every supported zone once", () => {
    const values = timeZoneOptions(january).map((option) => option.value);
    expect(values[0]).toBe("UTC");
    expect(values).toContain("Europe/Madrid");
    expect(new Set(values).size).toBe(values.length);
  });

  it("labels zones with a readable name and their offset on the given date", () => {
    const labels = new Map(timeZoneOptions(january).map((option) => [option.value, option.label]));
    expect(labels.get("Europe/Madrid")).toBe("Europe/Madrid (GMT+1)");
    expect(labels.get("America/New_York")).toBe("America/New York (GMT-5)");
    const kolkata = normalizeTimeZone("Asia/Kolkata");
    expect(kolkata).not.toBeNull();
    expect(labels.get(kolkata!)).toBe(`${kolkata!.replaceAll("_", " ")} (GMT+5:30)`);
  });
});
