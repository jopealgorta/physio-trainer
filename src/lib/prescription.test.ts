import { describe, expect, it } from "vitest";

import {
  EMPTY_ITEM_PRESCRIPTION,
  EMPTY_SET,
  formatPrescription,
  itemPrescriptionSchema,
  setSchema,
  type PrescriptionTranslate,
  type SetPrescription,
} from "./prescription";

const issues = (schema: typeof setSchema | typeof itemPrescriptionSchema, input: object) => {
  const result = schema.safeParse(input);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path[0], issue.message]));
};

describe("field limits", () => {
  it("coerces numbers and trims text", () => {
    expect(
      setSchema.parse({
        reps: " 8 ",
        repsMax: "12",
        durationSeconds: "45",
        load: "  red band ",
        distanceMeters: null,
        intensity: null,
      }),
    ).toEqual({
      reps: 8,
      repsMax: 12,
      durationSeconds: 45,
      load: "red band",
      distanceMeters: null,
      intensity: null,
    });
    expect(
      itemPrescriptionSchema.parse({
        holdSeconds: "5",
        restSeconds: "60",
        side: "alternating",
        notes: " slow ",
      }),
    ).toEqual({ holdSeconds: 5, restSeconds: 60, side: "alternating", notes: "slow" });
  });

  it.each([
    [setSchema, { reps: "abc" }, { reps: "notAWholeNumber" }],
    [setSchema, { reps: "2.5" }, { reps: "notAWholeNumber" }],
    [setSchema, { reps: "1000" }, { reps: "outOfRange" }],
    [setSchema, { durationSeconds: "14401" }, { durationSeconds: "outOfRange" }],
    [setSchema, { load: "x".repeat(41) }, { load: "tooLong" }],
    [setSchema, { repsMax: "12" }, { repsMax: "repsMaxWithoutReps" }],
    [setSchema, { reps: "12", repsMax: "12" }, { repsMax: "repsMaxNotAboveReps" }],
    [setSchema, { reps: "12", repsMax: "8" }, { repsMax: "repsMaxNotAboveReps" }],
    [itemPrescriptionSchema, { holdSeconds: "-1" }, { holdSeconds: "outOfRange" }],
    [itemPrescriptionSchema, { restSeconds: "3601" }, { restSeconds: "outOfRange" }],
    [itemPrescriptionSchema, { notes: "x".repeat(501) }, { notes: "tooLong" }],
    [itemPrescriptionSchema, { side: "up" }, { side: "invalidSide" }],
  ])("rejects %j", (schema, input, expected) => {
    expect(issues(schema, input)).toEqual(expected);
  });
});

// A readable fake translator: keeps the structure the real messages produce.
const t: PrescriptionTranslate = (key, values = {}) => {
  switch (key) {
    case "summary.count":
      return String(values.value);
    case "summary.range":
      return `${values.min}–${values.max}`;
    case "summary.seconds":
      return `${values.value} s`;
    case "summary.sets":
      return `${values.count} sets`;
    case "summary.blank":
      return "–";
    case "summary.minutes":
      return `${values.value} min`;
    case "summary.distanceKm":
      return `${values.value} km`;
    case "summary.distanceM":
      return `${values.value} m`;
    case "summary.hold":
      return `hold ${values.value} s`;
    case "summary.rest":
      return `rest ${values.value} s`;
    default:
      return key.replace("sides.", "");
  }
};
const set = (overrides: Partial<SetPrescription> = {}): SetPrescription => ({
  ...EMPTY_SET,
  ...overrides,
});
const item = (
  sets: SetPrescription[],
  extra: Partial<Parameters<typeof formatPrescription>[0]> = {},
) => formatPrescription({ sets, holdSeconds: null, restSeconds: null, side: null, ...extra }, t);

describe("setSchema / itemPrescriptionSchema", () => {
  it("parses blanks to null and keeps the range rule", () => {
    expect(
      setSchema.parse({
        reps: "",
        repsMax: "",
        durationSeconds: "",
        load: " ",
        distanceMeters: null,
        intensity: null,
      }),
    ).toEqual(EMPTY_SET);
    expect(setSchema.safeParse({ reps: "8", repsMax: "12" }).success).toBe(true);
    expect(setSchema.safeParse({ repsMax: "12" }).success).toBe(false);
    expect(setSchema.safeParse({ reps: "12", repsMax: "8" }).success).toBe(false);
    expect(setSchema.safeParse({ reps: "0" }).success).toBe(false);
  });
  it("validates hold, rest, side and notes", () => {
    expect(itemPrescriptionSchema.parse({})).toEqual(EMPTY_ITEM_PRESCRIPTION);
    expect(itemPrescriptionSchema.safeParse({ side: "up" }).success).toBe(false);
    expect(itemPrescriptionSchema.safeParse({ holdSeconds: "5", restSeconds: "60" }).success).toBe(
      true,
    );
  });
});

describe("formatPrescription", () => {
  it("is empty when nothing is set", () => {
    expect(item([])).toBe("");
    expect(item([set()])).toBe("");
  });
  it("collapses identical sets", () => {
    expect(item([set({ reps: 12 }), set({ reps: 12 }), set({ reps: 12 })])).toBe("3 × 12");
    expect(item([set({ reps: 12 })])).toBe("12");
  });
  it("lists differing sets and ranges", () => {
    expect(item([set({ reps: 12 }), set({ reps: 10 }), set({ reps: 8 })])).toBe("12 · 10 · 8");
    expect(item([set({ reps: 8, repsMax: 12 }), set({ reps: 8, repsMax: 12 })])).toBe("2 × 8–12");
  });
  it("shows duration alone or after reps", () => {
    expect(item([set({ durationSeconds: 30 }), set({ durationSeconds: 30 })])).toBe("2 × 30 s");
    expect(item([set({ reps: 10, durationSeconds: 3 })])).toBe("10 / 3 s");
  });
  it("appends a shared load once and repeats differing loads per set", () => {
    expect(
      item([
        set({ reps: 12, load: "5 kg" }),
        set({ reps: 12, load: "5 kg" }),
        set({ reps: 12, load: "5 kg" }),
      ]),
    ).toBe("3 × 12 · 5 kg");
    expect(item([set({ reps: 12, load: "5 kg" }), set({ reps: 10, load: "5 kg" })])).toBe(
      "12 · 10 · 5 kg",
    );
    expect(
      item([
        set({ reps: 12, load: "5 kg" }),
        set({ reps: 10, load: "7 kg" }),
        set({ reps: 8, load: "9 kg" }),
      ]),
    ).toBe("12 × 5 kg · 10 × 7 kg · 8 × 9 kg");
    expect(item([set({ load: "red band" })])).toBe("red band");
    expect(item([set({ load: "5 kg" }), set({ load: "7 kg" })])).toBe("5 kg · 7 kg");
  });
  it("handles blank sets without empty separators", () => {
    expect(item([set(), set(), set()])).toBe("3 sets");
    expect(item([set({ reps: 12 }), set()])).toBe("12 · –");
  });
  it("appends hold, rest and side after the sets", () => {
    expect(
      item([set({ reps: 12 }), set({ reps: 12 }), set({ reps: 12 })], {
        holdSeconds: 5,
        restSeconds: 60,
        side: "left",
      }),
    ).toBe("3 × 12 · hold 5 s · rest 60 s · left");
    expect(item([], { restSeconds: 30 })).toBe("rest 30 s");
    expect(item([set()], { side: "alternating" })).toBe("alternating");
  });
});

describe("aerobic prescriptions", () => {
  it("summarises aerobic sets", () => {
    const aerobic = {
      ...EMPTY_SET,
      durationSeconds: 1800,
      distanceMeters: 5000,
      intensity: "Zone 2",
    };
    expect(
      formatPrescription({ sets: [aerobic], holdSeconds: null, restSeconds: null, side: null }, t),
    ).toBe("30 min / 5 km · Zone 2");
  });
  it("summarises intervals", () => {
    const interval = { ...EMPTY_SET, distanceMeters: 500, intensity: "2:00/500m" };
    expect(
      formatPrescription(
        {
          sets: [interval, interval, interval, interval],
          holdSeconds: null,
          restSeconds: 90,
          side: null,
        },
        t,
      ),
    ).toBe("4 × 500 m · 2:00/500m · rest 90 s");
  });
  it("shows minutes for whole minutes", () => {
    const minutes = { ...EMPTY_SET, durationSeconds: 120 };
    expect(
      formatPrescription({ sets: [minutes], holdSeconds: null, restSeconds: null, side: null }, t),
    ).toBe("2 min");
  });
  it("validates distance and intensity", () => {
    expect(setSchema.safeParse({ ...EMPTY_SET, distanceMeters: 0 }).success).toBe(false);
    expect(setSchema.safeParse({ ...EMPTY_SET, intensity: "x".repeat(41) }).success).toBe(false);
  });
});
