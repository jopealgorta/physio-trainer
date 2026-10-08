import { describe, expect, it } from "vitest";

import { createRoutineSchema, isUuid, saveRoutineSchema } from "./schemas";

const ID = "0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10";
const EX = "1b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a11";

const item = (overrides: Record<string, unknown> = {}) => ({
  exerciseId: EX,
  groupKey: null,
  sectionKey: "s1",
  holdSeconds: null,
  restSeconds: null,
  side: null,
  notes: null,
  sets: [{ reps: 10, repsMax: null, durationSeconds: null, load: null }],
  ...overrides,
});

const payload = (overrides: Record<string, unknown> = {}) => ({
  id: ID,
  version: 1,
  name: "  Knee rehab ",
  notes: "",
  caseId: "",
  sessionsPerWeek: null,
  sessionsPerDay: "",
  status: "draft",
  sections: [{ key: "s1", name: "Warm-up" }],
  groups: [],
  items: [item()],
  ...overrides,
});

const messages = (input: unknown) => {
  const parsed = saveRoutineSchema.safeParse(input);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
};

describe("isUuid", () => {
  it("accepts uuids only", () => {
    expect(isUuid(ID)).toBe(true);
    expect(isUuid("nope")).toBe(false);
    expect(isUuid("")).toBe(false);
  });
});

describe("createRoutineSchema", () => {
  it("trims the name and turns a blank case into null", () => {
    expect(createRoutineSchema.parse({ customerId: ID, name: " Plan ", caseId: "" })).toEqual({
      customerId: ID,
      name: "Plan",
      caseId: null,
    });
  });

  it("rejects a blank or long name and a bad customer", () => {
    expect(createRoutineSchema.safeParse({ customerId: ID, name: " ", caseId: null }).success).toBe(
      false,
    );
    expect(
      createRoutineSchema.safeParse({ customerId: ID, name: "x".repeat(81), caseId: null }).success,
    ).toBe(false);
    expect(
      createRoutineSchema.safeParse({ customerId: "x", name: "A", caseId: null }).success,
    ).toBe(false);
  });
});

describe("saveRoutineSchema", () => {
  it("parses a valid payload, turning blanks into null", () => {
    const parsed = saveRoutineSchema.parse(payload());
    expect(parsed).toMatchObject({
      id: ID,
      version: 1,
      name: "Knee rehab",
      notes: null,
      caseId: null,
      sessionsPerWeek: null,
      sessionsPerDay: null,
      status: "draft",
      groups: [],
    });
    expect(parsed.items).toHaveLength(1);
  });

  it("requires a name of at most 80 characters", () => {
    expect(messages(payload({ name: "   " }))).toContain("nameRequired");
    expect(messages(payload({ name: "x".repeat(81) }))).toContain("nameTooLong");
    expect(saveRoutineSchema.safeParse(payload({ name: "x".repeat(80) })).success).toBe(true);
  });

  it("limits notes to 2000 characters", () => {
    expect(messages(payload({ notes: "x".repeat(2001) }))).toContain("notesTooLong");
    expect(saveRoutineSchema.parse(payload({ notes: " hi " })).notes).toBe("hi");
  });

  it.each([0, 15])("rejects sessionsPerWeek %i", (value) => {
    expect(messages(payload({ sessionsPerWeek: value }))).toContain("outOfRange");
  });

  it.each([0, 6])("rejects sessionsPerDay %i", (value) => {
    expect(messages(payload({ sessionsPerDay: value }))).toContain("outOfRange");
  });

  it("accepts the range bounds", () => {
    const parsed = saveRoutineSchema.parse(payload({ sessionsPerWeek: 14, sessionsPerDay: 1 }));
    expect(parsed).toMatchObject({ sessionsPerWeek: 14, sessionsPerDay: 1 });
  });

  it("rejects an unknown status, a bad version and a bad case id", () => {
    expect(saveRoutineSchema.safeParse(payload({ status: "done" })).success).toBe(false);
    expect(saveRoutineSchema.safeParse(payload({ version: 0 })).success).toBe(false);
    expect(saveRoutineSchema.safeParse(payload({ caseId: "nope" })).success).toBe(false);
  });

  it("limits items to 50 and sets to 20", () => {
    expect(saveRoutineSchema.safeParse(payload({ items: Array(50).fill(item()) })).success).toBe(
      true,
    );
    expect(saveRoutineSchema.safeParse(payload({ items: Array(51).fill(item()) })).success).toBe(
      false,
    );
    const set = { reps: 1, repsMax: null, durationSeconds: null, load: null };
    expect(
      saveRoutineSchema.safeParse(payload({ items: [item({ sets: Array(21).fill(set) })] }))
        .success,
    ).toBe(false);
    expect(
      saveRoutineSchema.safeParse(payload({ items: [item({ sets: Array(20).fill(set) })] }))
        .success,
    ).toBe(true);
  });

  it("validates each set's prescription", () => {
    const bad = { reps: 10, repsMax: 5, durationSeconds: null, load: null };
    expect(messages(payload({ items: [item({ sets: [bad] })] }))).toContain("repsMaxNotAboveReps");
  });

  describe("superset structure", () => {
    const group = { key: "g", restSeconds: 60 };
    const member = (overrides: Record<string, unknown> = {}) =>
      item({ groupKey: "g", ...overrides });

    it("accepts a valid superset", () => {
      const parsed = saveRoutineSchema.safeParse(
        payload({ groups: [group], items: [member(), member(), item()] }),
      );
      expect(parsed.success).toBe(true);
    });

    it.each([
      ["a group of one", { groups: [group], items: [member(), item()] }, "groupSize"],
      [
        "non-consecutive members",
        { groups: [group], items: [member(), item(), member()] },
        "groupNotConsecutive",
      ],
      [
        "unequal set counts",
        {
          groups: [group],
          items: [
            member(),
            member({
              sets: [
                { reps: 1, repsMax: null, durationSeconds: null, load: null },
                { reps: 1, repsMax: null, durationSeconds: null, load: null },
              ],
            }),
          ],
        },
        "groupSetsMismatch",
      ],
      [
        "rest on a grouped item",
        { groups: [group], items: [member({ restSeconds: 30 }), member()] },
        "groupItemRest",
      ],
      ["an unknown group", { groups: [], items: [member(), member()] }, "unknownGroup"],
    ])("rejects %s", (_name, overrides, code) => {
      const parsed = saveRoutineSchema.safeParse(payload(overrides));
      expect(parsed.success).toBe(false);
      if (parsed.success) return;
      const issue = parsed.error.issues.find((i) => i.message === code);
      expect(issue?.path).toEqual(["items"]);
    });
  });

  describe("sections", () => {
    const sec = (key: string, name = key) => ({ key, name });

    it("trims names and accepts empty sections", () => {
      const parsed = saveRoutineSchema.parse(
        payload({ sections: [sec("s1", "  Warm-up "), sec("s2", "Main")] }),
      );
      expect(parsed.sections).toEqual([sec("s1", "Warm-up"), sec("s2", "Main")]);
    });

    it("rejects 0 sections and more than 12", () => {
      expect(saveRoutineSchema.safeParse(payload({ sections: [], items: [] })).success).toBe(false);
      const many = Array.from({ length: 13 }, (_, i) => sec(`k${i}`));
      expect(
        saveRoutineSchema.safeParse(
          payload({ sections: many, items: [item({ sectionKey: "k0" })] }),
        ).success,
      ).toBe(false);
      expect(
        saveRoutineSchema.safeParse(
          payload({ sections: many.slice(0, 12), items: [item({ sectionKey: "k0" })] }),
        ).success,
      ).toBe(true);
    });

    it("rejects blank and over-long names", () => {
      expect(saveRoutineSchema.safeParse(payload({ sections: [sec("s1", "   ")] })).success).toBe(
        false,
      );
      expect(
        saveRoutineSchema.safeParse(payload({ sections: [sec("s1", "x".repeat(61))] })).success,
      ).toBe(false);
      expect(
        saveRoutineSchema.safeParse(payload({ sections: [sec("s1", "x".repeat(60))] })).success,
      ).toBe(true);
    });

    it.each([
      ["an unknown section key", { items: [item({ sectionKey: "nope" })] }, "unknownSection"],
      [
        "items out of section order",
        {
          sections: [sec("s1"), sec("s2")],
          items: [item({ sectionKey: "s2" }), item({ sectionKey: "s1" })],
        },
        "sectionOrder",
      ],
      [
        "a group across sections",
        {
          sections: [sec("s1"), sec("s2")],
          groups: [{ key: "g", restSeconds: 60 }],
          items: [
            item({ groupKey: "g", sectionKey: "s1" }),
            item({ groupKey: "g", sectionKey: "s2" }),
          ],
        },
        "groupSpansSections",
      ],
    ])("rejects %s", (_name, overrides, code) => {
      expect(messages(payload(overrides))).toContain(code);
    });
  });
});
