import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";

import {
  BODY_AREAS,
  BODY_SIDES,
  CASE_BODY_AREAS,
  PAIRED_BODY_AREAS,
  type BodyAreaSelection,
  bodyAreaSchema,
  caseBodyAreaSchema,
  coversRegion,
  isPairedArea,
  selectArea,
  toggleArea,
} from "./body-areas";

describe("body area lists", () => {
  it("has a translation for every area and side, and nothing extra", () => {
    expect(Object.keys(en.BodyAreas.areas).sort()).toEqual([...BODY_AREAS].sort());
    expect(Object.keys(en.BodyAreas.sides).sort()).toEqual([...BODY_SIDES].sort());
  });

  it("keeps full_body out of the case list only", () => {
    expect(CASE_BODY_AREAS).not.toContain("full_body");
    expect(CASE_BODY_AREAS).toEqual(BODY_AREAS.filter((area) => area !== "full_body"));
    expect(bodyAreaSchema.safeParse("full_body").success).toBe(true);
    expect(caseBodyAreaSchema.safeParse("full_body").success).toBe(false);
    expect(caseBodyAreaSchema.safeParse("knee").success).toBe(true);
    expect(bodyAreaSchema.safeParse("ribs").success).toBe(false);
  });

  it("marks limbs as paired and the trunk as midline", () => {
    expect(PAIRED_BODY_AREAS.every((area) => BODY_AREAS.includes(area))).toBe(true);
    expect(isPairedArea("knee")).toBe(true);
    expect(isPairedArea("shoulder")).toBe(true);
    expect(isPairedArea("neck")).toBe(false);
    expect(isPairedArea("lower_back")).toBe(false);
    expect(isPairedArea("full_body")).toBe(false);
  });
});

describe("toggleArea", () => {
  it("adds and removes, keeping head-to-toe order", () => {
    expect(toggleArea([], "knee")).toEqual(["knee"]);
    expect(toggleArea(["knee"], "neck")).toEqual(["neck", "knee"]);
    expect(toggleArea(["neck", "knee"], "knee")).toEqual(["neck"]);
  });

  it("does not mutate its input", () => {
    const value = ["knee"] as const;
    toggleArea(value, "neck");
    expect(value).toEqual(["knee"]);
  });
});

describe("selectArea (single mode)", () => {
  const knee = (side: BodyAreaSelection["side"]): BodyAreaSelection => ({ area: "knee", side });

  it.each([
    // [start, area, clicked side, expected]
    ["empty → left knee", null, "knee", "left", knee("left")],
    ["left → + right = both", knee("left"), "knee", "right", knee("both")],
    ["both → left again = right", knee("both"), "knee", "left", knee("right")],
    ["right → right again = cleared", knee("right"), "knee", "right", null],
    ["unsided (from list) → map left", knee(null), "knee", "left", knee("left")],
    [
      "other area replaces, keeps new side",
      { area: "elbow", side: "both" },
      "knee",
      "right",
      knee("right"),
    ],
  ] as const)("with side: %s", (_label, start, area, clicked, expected) => {
    expect(selectArea(start, area, clicked, true)).toEqual(expected);
  });

  it("gives midline areas no side and clears them on a second click", () => {
    expect(selectArea(knee("left"), "neck", null, true)).toEqual({ area: "neck", side: null });
    expect(selectArea({ area: "neck", side: null }, "neck", null, true)).toBeNull();
  });

  it("list choice of a paired area starts without a side", () => {
    expect(selectArea({ area: "neck", side: null }, "elbow", null, true)).toEqual({
      area: "elbow",
      side: null,
    });
  });

  it("ignores sides when withSide is off", () => {
    expect(selectArea(null, "knee", "left", false)).toEqual(knee(null));
    expect(selectArea(knee(null), "knee", "right", false)).toBeNull();
  });
});

describe("coversRegion", () => {
  it("highlights only the chosen side, or both sides for both/unsided", () => {
    expect(coversRegion({ area: "knee", side: "left" }, "knee", "left")).toBe(true);
    expect(coversRegion({ area: "knee", side: "left" }, "knee", "right")).toBe(false);
    expect(coversRegion({ area: "knee", side: "both" }, "knee", "right")).toBe(true);
    expect(coversRegion({ area: "knee", side: null }, "knee", "right")).toBe(true);
    expect(coversRegion({ area: "neck", side: null }, "neck", null)).toBe(true);
    expect(coversRegion({ area: "knee", side: "left" }, "elbow", "left")).toBe(false);
    expect(coversRegion(null, "knee", "left")).toBe(false);
  });
});
