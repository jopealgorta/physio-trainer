import { describe, expect, it } from "vitest";

import { firstParam } from "./search-params";

describe("firstParam", () => {
  it("returns the first string value", () => {
    expect(firstParam("a")).toBe("a");
    expect(firstParam(["a", "b"])).toBe("a");
    expect(firstParam(undefined)).toBeUndefined();
  });
});
