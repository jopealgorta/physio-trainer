import { describe, expect, it } from "vitest";

import { BODY_AREAS, BODY_SIDES } from "@/lib/body-areas";

import { bodyAreaEnum, bodySideEnum } from "./enums";

describe("body enums", () => {
  it("are built from the canonical TS lists", () => {
    expect(bodyAreaEnum.enumName).toBe("body_area");
    expect(bodyAreaEnum.enumValues).toEqual([...BODY_AREAS]);
    expect(bodySideEnum.enumName).toBe("body_side");
    expect(bodySideEnum.enumValues).toEqual([...BODY_SIDES]);
  });
});
