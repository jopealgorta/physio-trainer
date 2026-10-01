import { describe, expect, it } from "vitest";

import {
  addEntrySchema,
  addNewRoutineEntrySchema,
  copyEntrySchema,
  createPlanSchema,
  moveEntrySchema,
  removeEntrySchema,
  setLabelSchema,
  updatePlanSchema,
} from "./schemas";

const ID = "0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10";
const R = "1b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a11";
const E = "2b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a12";

const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? [] : (result.error?.issues.map((issue) => issue.message) ?? []);

describe("createPlanSchema", () => {
  it("trims the name and turns a blank case into null", () => {
    expect(createPlanSchema.parse({ customerId: ID, name: " Week 1 ", caseId: "" })).toEqual({
      customerId: ID,
      name: "Week 1",
      caseId: null,
    });
  });

  it("rejects a blank or long name", () => {
    expect(
      messages(createPlanSchema.safeParse({ customerId: ID, name: " ", caseId: null })),
    ).toEqual(["nameRequired"]);
    expect(
      messages(createPlanSchema.safeParse({ customerId: ID, name: "x".repeat(81), caseId: null })),
    ).toEqual(["nameTooLong"]);
  });

  it("rejects a malformed customer or case id", () => {
    expect(
      createPlanSchema.safeParse({ customerId: "nope", name: "A", caseId: null }).success,
    ).toBe(false);
    expect(createPlanSchema.safeParse({ customerId: ID, name: "A", caseId: "nope" }).success).toBe(
      false,
    );
  });
});

describe("updatePlanSchema", () => {
  const base = { id: ID, name: "A", notes: "", caseId: null, status: "draft" };

  it("normalises blank notes to null and keeps the status", () => {
    expect(updatePlanSchema.parse({ ...base, notes: "  hi " })).toMatchObject({
      notes: "hi",
      status: "draft",
    });
    expect(updatePlanSchema.parse(base).notes).toBeNull();
  });

  it("rejects an unknown status and over-long notes", () => {
    expect(updatePlanSchema.safeParse({ ...base, status: "done" }).success).toBe(false);
    expect(messages(updatePlanSchema.safeParse({ ...base, notes: "x".repeat(2001) }))).toEqual([
      "notesTooLong",
    ]);
  });
});

describe("addEntrySchema", () => {
  const base = { planId: ID, weekday: 1, routineId: R };

  it("accepts weekdays 1-7 only", () => {
    expect(addEntrySchema.safeParse({ ...base, weekday: 7 }).success).toBe(true);
    expect(addEntrySchema.safeParse({ ...base, weekday: 0 }).success).toBe(false);
    expect(addEntrySchema.safeParse({ ...base, weekday: 8 }).success).toBe(false);
    expect(addEntrySchema.safeParse({ ...base, weekday: 1.5 }).success).toBe(false);
  });

  it("normalises the label and caps it at 40 characters", () => {
    expect(addEntrySchema.parse({ ...base, label: "  " }).label).toBeNull();
    expect(addEntrySchema.parse({ ...base, label: " Morning " }).label).toBe("Morning");
    expect(messages(addEntrySchema.safeParse({ ...base, label: "x".repeat(41) }))).toEqual([
      "labelTooLong",
    ]);
  });

  it("keeps standalone optional", () => {
    expect(addEntrySchema.parse(base).standalone).toBeUndefined();
    expect(addEntrySchema.parse({ ...base, standalone: false }).standalone).toBe(false);
  });
});

describe("other board schemas", () => {
  it("addNewRoutineEntrySchema needs a name", () => {
    expect(addNewRoutineEntrySchema.safeParse({ planId: ID, weekday: 2, name: " " }).success).toBe(
      false,
    );
    expect(addNewRoutineEntrySchema.parse({ planId: ID, weekday: 2, name: " Knee " }).name).toBe(
      "Knee",
    );
  });

  it("moveEntrySchema bounds the index to a day's capacity", () => {
    const base = { planId: ID, entryId: E, weekday: 3 };
    expect(moveEntrySchema.safeParse({ ...base, index: 0 }).success).toBe(true);
    expect(moveEntrySchema.safeParse({ ...base, index: 6 }).success).toBe(true);
    expect(moveEntrySchema.safeParse({ ...base, index: 7 }).success).toBe(false);
    expect(moveEntrySchema.safeParse({ ...base, index: -1 }).success).toBe(false);
  });

  it("copyEntrySchema, setLabelSchema and removeEntrySchema validate ids", () => {
    expect(copyEntrySchema.safeParse({ planId: ID, entryId: "nope", weekday: 1 }).success).toBe(
      false,
    );
    expect(setLabelSchema.parse({ planId: ID, entryId: E, label: "" }).label).toBeNull();
    expect(removeEntrySchema.parse({ planId: ID, entryId: E }).deleteRoutine).toBeUndefined();
    expect(removeEntrySchema.safeParse({ planId: "x", entryId: E }).success).toBe(false);
  });
});
