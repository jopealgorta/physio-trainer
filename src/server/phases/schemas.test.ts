import { describe, expect, it } from "vitest";

import { copyPhaseSchema, setPhaseSchema, windowIssue } from "./schemas";

const ID = "0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10";

const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? [] : (result.error?.issues.map((issue) => issue.message) ?? []);

describe("setPhaseSchema", () => {
  it("trims the label and turns blanks into null", () => {
    expect(
      setPhaseSchema.parse({
        kind: "routine",
        id: ID,
        phaseLabel: "  Phase 2 ",
        startsOn: "",
        endsOn: null,
      }),
    ).toEqual({ kind: "routine", id: ID, phaseLabel: "Phase 2", startsOn: null, endsOn: null });
    expect(
      setPhaseSchema.parse({ kind: "plan", id: ID, phaseLabel: " ", startsOn: null, endsOn: null })
        .phaseLabel,
    ).toBeNull();
  });

  it("accepts a window and rejects a reversed or malformed one", () => {
    const base = { kind: "plan", id: ID, phaseLabel: null };
    expect(
      setPhaseSchema.safeParse({ ...base, startsOn: "2026-10-01", endsOn: "2026-10-01" }).success,
    ).toBe(true);
    expect(
      messages(setPhaseSchema.safeParse({ ...base, startsOn: "2026-10-02", endsOn: "2026-10-01" })),
    ).toEqual(["endBeforeStart"]);
    expect(
      messages(setPhaseSchema.safeParse({ ...base, startsOn: "2026-02-30", endsOn: null })),
    ).toEqual(["startsInvalid"]);
    expect(messages(setPhaseSchema.safeParse({ ...base, startsOn: null, endsOn: "x" }))).toEqual([
      "endsInvalid",
    ]);
  });

  it("rejects a long label, an unknown kind and a malformed id", () => {
    const base = { kind: "routine", id: ID, startsOn: null, endsOn: null };
    expect(messages(setPhaseSchema.safeParse({ ...base, phaseLabel: "x".repeat(41) }))).toEqual([
      "labelTooLong",
    ]);
    expect(setPhaseSchema.safeParse({ ...base, kind: "template", phaseLabel: null }).success).toBe(
      false,
    );
    expect(setPhaseSchema.safeParse({ ...base, id: "nope", phaseLabel: null }).success).toBe(false);
  });
});

describe("copyPhaseSchema", () => {
  const base = {
    kind: "routine",
    id: ID,
    phaseLabel: "Phase 2",
    startsOn: "2026-10-08",
    endsOn: "",
    endCurrent: true,
  };

  it("parses a valid copy", () => {
    expect(copyPhaseSchema.parse(base)).toEqual({ ...base, endsOn: null });
  });

  it("requires a start date and orders the window", () => {
    expect(messages(copyPhaseSchema.safeParse({ ...base, startsOn: "" }))).toEqual([
      "startsInvalid",
    ]);
    expect(messages(copyPhaseSchema.safeParse({ ...base, endsOn: "2026-10-07" }))).toEqual([
      "endBeforeStart",
    ]);
  });
});

describe("windowIssue", () => {
  it("returns the window error code carried by a failed parse, else null", () => {
    const bad = setPhaseSchema.safeParse({
      kind: "plan",
      id: ID,
      phaseLabel: null,
      startsOn: "2026-10-02",
      endsOn: "2026-10-01",
    });
    expect(!bad.success && windowIssue(bad.error)).toBe("endBeforeStart");
    const other = setPhaseSchema.safeParse({
      kind: "plan",
      id: ID,
      phaseLabel: "x".repeat(41),
      startsOn: null,
      endsOn: null,
    });
    expect(!other.success && windowIssue(other.error)).toBeNull();
  });
});
