import { describe, expect, it } from "vitest";

import { normalizeTag, normalizeTags, splitTagInput } from "./tags";

describe("normalizeTag", () => {
  it.each([
    ["Band", "band"],
    ["  band  ", "band"],
    ["#Band", "band"],
    ["resistance   BAND", "resistance band"],
    ["Élévation", "élévation"],
    ["a,b", "a b"],
    ["   ", ""],
  ])("normalises %j to %j", (raw, expected) => {
    expect(normalizeTag(raw)).toBe(expected);
  });
});

describe("normalizeTags", () => {
  it("normalises, drops empties and de-duplicates keeping first-seen order", () => {
    expect(normalizeTags(["Band", " beginner", "band", "", "#BAND", "Beginner "])).toEqual([
      "band",
      "beginner",
    ]);
  });
});

describe("splitTagInput", () => {
  it("splits pasted text on commas and normalises each part", () => {
    expect(splitTagInput("Band, rubber ,, #Home")).toEqual(["band", "rubber", "home"]);
  });
});
