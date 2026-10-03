import { describe, expect, it } from "vitest";

import { logExerciseSchema } from "./exercise-log-schema";

const ID = "3e473832-bc4d-475b-9a6a-0356874dc603";
const valid = {
  routineId: ID,
  entryId: null,
  exerciseId: ID,
  performedOn: "2026-10-07",
  rpe: 6,
  setWeightsKg: [12.5, null, 15],
  comment: "ok",
};

describe("logExerciseSchema", () => {
  it("accepts a complete log", () => {
    expect(logExerciseSchema.parse(valid)).toEqual(valid);
  });

  it("accepts set weights and normalises them", () => {
    const parsed = logExerciseSchema.parse({ ...valid, setWeightsKg: [20, null, 22.55, null] });
    expect(parsed.setWeightsKg).toEqual([20, null, 22.6]);
  });

  it("rejects weights out of range and too many sets", () => {
    expect(logExerciseSchema.safeParse({ ...valid, setWeightsKg: [1000] }).success).toBe(false);
    expect(logExerciseSchema.safeParse({ ...valid, setWeightsKg: [-1] }).success).toBe(false);
    expect(logExerciseSchema.safeParse({ ...valid, setWeightsKg: Array(21).fill(1) }).success).toBe(
      false,
    );
  });

  it("no longer takes pain or a single weight", () => {
    const parsed = logExerciseSchema.parse({ ...valid, pain: 3, weightKg: 5 });
    expect(parsed).not.toHaveProperty("pain");
    expect(parsed).not.toHaveProperty("weightKg");
  });

  it("rejects out-of-range ratings", () => {
    expect(logExerciseSchema.safeParse({ ...valid, rpe: -1 }).success).toBe(false);
  });

  it("trims comments and turns blank into null", () => {
    expect(logExerciseSchema.parse({ ...valid, comment: "  hi " }).comment).toBe("hi");
    expect(logExerciseSchema.parse({ ...valid, comment: "  " }).comment).toBeNull();
    expect(logExerciseSchema.safeParse({ ...valid, comment: "x".repeat(1001) }).success).toBe(
      false,
    );
  });
});
