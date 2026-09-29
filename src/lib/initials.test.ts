import { describe, expect, it } from "vitest";

import { initials } from "./initials";

describe("initials", () => {
  it("uses first letters of first and last name, uppercased", () => {
    expect(initials("ana", "garcía")).toBe("AG");
  });
  it("works without a last name or with a single letter", () => {
    expect(initials("Ana", null)).toBe("A");
    expect(initials("a", "")).toBe("A");
  });
  it("is unicode-safe", () => {
    expect(initials("Ñandú", "Öz")).toBe("ÑÖ");
    expect(initials("😀 Sam", null)).toBe("😀");
  });
  it("never returns an empty string for a non-empty name", () => {
    expect(initials("  ", null)).toBe("?");
  });
});
