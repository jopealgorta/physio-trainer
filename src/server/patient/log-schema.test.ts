import { describe, expect, it } from "vitest";

import { logSessionSchema } from "./log-schema";

const ID = "3e473832-bc4d-475b-9a6a-0356874dc603";
const valid = {
  routineId: ID,
  entryId: null,
  performedOn: "2026-10-07",
  completed: true,
  pain: 5,
  rpe: null,
  comment: "ok",
};

describe("logSessionSchema", () => {
  it("accepts a complete log", () => {
    expect(logSessionSchema.parse(valid)).toEqual(valid);
    expect(logSessionSchema.parse({ ...valid, entryId: ID, pain: null }).entryId).toBe(ID);
  });

  it("accepts RPE 0-10 and rejects anything else", () => {
    expect(logSessionSchema.parse({ ...valid, rpe: 7 }).rpe).toBe(7);
    expect(logSessionSchema.safeParse({ ...valid, rpe: 0 }).success).toBe(true);
    for (const rpe of [-1, 11, 2.5, "3"]) {
      expect(logSessionSchema.safeParse({ ...valid, rpe }).success).toBe(false);
    }
  });

  it("parses a missing rpe (an old client) to null", () => {
    const old: Record<string, unknown> = { ...valid };
    delete old.rpe;
    expect(logSessionSchema.parse(old).rpe).toBeNull();
  });

  it("trims the comment and turns a blank one into null", () => {
    expect(logSessionSchema.parse({ ...valid, comment: "  pinchy  " }).comment).toBe("pinchy");
    expect(logSessionSchema.parse({ ...valid, comment: "   " }).comment).toBeNull();
    expect(logSessionSchema.parse({ ...valid, comment: null }).comment).toBeNull();
  });

  it("rejects a comment over 1000 characters", () => {
    expect(logSessionSchema.safeParse({ ...valid, comment: "a".repeat(1000) }).success).toBe(true);
    expect(logSessionSchema.safeParse({ ...valid, comment: "a".repeat(1001) }).success).toBe(false);
  });

  it("rejects pain outside 0-10 or not whole", () => {
    for (const pain of [-1, 11, 2.5, "3"]) {
      expect(logSessionSchema.safeParse({ ...valid, pain }).success).toBe(false);
    }
    expect(logSessionSchema.safeParse({ ...valid, pain: 0 }).success).toBe(true);
  });

  it("rejects bad ids and dates", () => {
    expect(logSessionSchema.safeParse({ ...valid, routineId: "nope" }).success).toBe(false);
    expect(logSessionSchema.safeParse({ ...valid, entryId: "nope" }).success).toBe(false);
    expect(logSessionSchema.safeParse({ ...valid, performedOn: "2026-02-30" }).success).toBe(false);
    expect(logSessionSchema.safeParse({ ...valid, performedOn: "yesterday" }).success).toBe(false);
  });

  it("rejects missing fields", () => {
    const rest: Record<string, unknown> = { ...valid };
    delete rest.completed;
    expect(logSessionSchema.safeParse(rest).success).toBe(false);
  });
});
