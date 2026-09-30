import { describe, expect, it } from "vitest";

import { ROUTINE_NAME_MAX, ROUTINE_NOTES_MAX } from "./routines";
import { validateHeader, type HeaderInput } from "./routine-validation";

const valid: HeaderInput = {
  name: "Knee rehab",
  notes: "",
  sessionsPerWeek: "",
  sessionsPerDay: "",
};

describe("validateHeader", () => {
  it("accepts a valid header and parses blank sessions to null", () => {
    expect(validateHeader(valid)).toEqual({
      ok: true,
      sessionsPerWeek: null,
      sessionsPerDay: null,
    });
  });

  it("parses numeric strings", () => {
    expect(validateHeader({ ...valid, sessionsPerWeek: " 3 ", sessionsPerDay: "2" })).toEqual({
      ok: true,
      sessionsPerWeek: 3,
      sessionsPerDay: 2,
    });
  });

  it("requires a trimmed name and caps its length", () => {
    expect(validateHeader({ ...valid, name: "   " })).toEqual({
      ok: false,
      errors: { name: "nameRequired" },
    });
    expect(validateHeader({ ...valid, name: "x".repeat(ROUTINE_NAME_MAX + 1) })).toEqual({
      ok: false,
      errors: { name: "nameTooLong" },
    });
    expect(validateHeader({ ...valid, name: "x".repeat(ROUTINE_NAME_MAX) }).ok).toBe(true);
  });

  it("caps the notes length", () => {
    expect(validateHeader({ ...valid, notes: "x".repeat(ROUTINE_NOTES_MAX + 1) })).toEqual({
      ok: false,
      errors: { notes: "notesTooLong" },
    });
  });

  it.each(["0", "15", "abc", "2.5", "-1", "1e1"])("rejects %s sessions per week", (value) => {
    expect(validateHeader({ ...valid, sessionsPerWeek: value })).toEqual({
      ok: false,
      errors: { sessionsPerWeek: "outOfRange" },
    });
  });

  it("checks sessions per day against its own range", () => {
    expect(validateHeader({ ...valid, sessionsPerDay: "5" }).ok).toBe(true);
    expect(validateHeader({ ...valid, sessionsPerDay: "6" })).toEqual({
      ok: false,
      errors: { sessionsPerDay: "outOfRange" },
    });
  });

  it("reports every failing field at once", () => {
    const result = validateHeader({
      name: "",
      notes: "",
      sessionsPerWeek: "99",
      sessionsPerDay: "0",
    });
    expect(result).toEqual({
      ok: false,
      errors: { name: "nameRequired", sessionsPerWeek: "outOfRange", sessionsPerDay: "outOfRange" },
    });
  });
});
