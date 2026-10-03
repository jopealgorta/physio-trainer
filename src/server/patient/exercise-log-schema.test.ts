import { describe, expect, it } from "vitest";

import { logExerciseSchema } from "./exercise-log-schema";

const ID = "3e473832-bc4d-475b-9a6a-0356874dc603";
const valid = {
  routineId: ID,
  entryId: null,
  exerciseId: ID,
  performedOn: "2026-10-07",
  pain: 4,
  rpe: 6,
  weightKg: 12.5,
  comment: "ok",
};

describe("logExerciseSchema", () => {
  it("accepts a complete log", () => {
    expect(logExerciseSchema.parse(valid)).toEqual(valid);
  });

  it("rejects a weight over the maximum and rounds to 0.1", () => {
    expect(logExerciseSchema.safeParse({ ...valid, weightKg: 1000 }).success).toBe(false);
    expect(logExerciseSchema.safeParse({ ...valid, weightKg: -1 }).success).toBe(false);
    expect(logExerciseSchema.parse({ ...valid, weightKg: 12.46 }).weightKg).toBe(12.5);
  });

  it("rejects out-of-range ratings", () => {
    expect(logExerciseSchema.safeParse({ ...valid, rpe: -1 }).success).toBe(false);
    expect(logExerciseSchema.safeParse({ ...valid, pain: 11 }).success).toBe(false);
  });

  it("trims comments and turns blank into null", () => {
    expect(logExerciseSchema.parse({ ...valid, comment: "  hi " }).comment).toBe("hi");
    expect(logExerciseSchema.parse({ ...valid, comment: "  " }).comment).toBeNull();
    expect(logExerciseSchema.safeParse({ ...valid, comment: "x".repeat(1001) }).success).toBe(
      false,
    );
  });
});
