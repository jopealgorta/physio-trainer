import { describe, expect, it } from "vitest";

import { EMPTY_PRESCRIPTION, PRESCRIPTION_FIELDS, prescriptionSchema } from "./prescription";

const issues = (input: Record<string, unknown>) => {
  const result = prescriptionSchema.safeParse(input);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path[0], issue.message]));
};

describe("prescriptionSchema", () => {
  it("turns blank form values into nulls", () => {
    const blank = Object.fromEntries(PRESCRIPTION_FIELDS.map((field) => [field, ""]));
    expect(prescriptionSchema.parse(blank)).toEqual(EMPTY_PRESCRIPTION);
    expect(prescriptionSchema.parse({})).toEqual(EMPTY_PRESCRIPTION);
  });

  it("coerces numbers and trims text", () => {
    expect(
      prescriptionSchema.parse({
        sets: "3",
        reps: " 8 ",
        repsMax: "12",
        durationSeconds: "45",
        holdSeconds: "5",
        restSeconds: "60",
        load: "  red band ",
        side: "alternating",
        notes: " slow ",
      }),
    ).toEqual({
      sets: 3,
      reps: 8,
      repsMax: 12,
      durationSeconds: 45,
      holdSeconds: 5,
      restSeconds: 60,
      load: "red band",
      side: "alternating",
      notes: "slow",
    });
  });

  it.each([
    [{ sets: "abc" }, { sets: "notAWholeNumber" }],
    [{ sets: "2.5" }, { sets: "notAWholeNumber" }],
    [{ sets: "0" }, { sets: "outOfRange" }],
    [{ sets: "100" }, { sets: "outOfRange" }],
    [{ reps: "1000" }, { reps: "outOfRange" }],
    [{ durationSeconds: "7201" }, { durationSeconds: "outOfRange" }],
    [{ holdSeconds: "-1" }, { holdSeconds: "outOfRange" }],
    [{ restSeconds: "3601" }, { restSeconds: "outOfRange" }],
    [{ load: "x".repeat(41) }, { load: "tooLong" }],
    [{ notes: "x".repeat(501) }, { notes: "tooLong" }],
    [{ side: "up" }, { side: "invalidSide" }],
    [{ repsMax: "12" }, { repsMax: "repsMaxWithoutReps" }],
    [{ reps: "12", repsMax: "12" }, { repsMax: "repsMaxNotAboveReps" }],
    [{ reps: "12", repsMax: "8" }, { repsMax: "repsMaxNotAboveReps" }],
  ])("rejects %j", (input, expected) => {
    expect(issues(input)).toEqual(expected);
  });
});
