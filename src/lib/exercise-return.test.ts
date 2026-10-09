import { describe, expect, it } from "vitest";

import { exerciseHref, exerciseReturnPath } from "./exercise-return";

describe("exerciseHref", () => {
  it("is the bare exercise page when opened from the plain library", () => {
    expect(exerciseHref("ex-1")).toBe("/library/ex-1");
    expect(exerciseHref("ex-1", "/library")).toBe("/library/ex-1");
  });

  it("carries any other origin so saving returns there", () => {
    expect(exerciseHref("ex-1", "/library?q=squat&view=list")).toBe(
      "/library/ex-1?from=%2Flibrary%3Fq%3Dsquat%26view%3Dlist",
    );
    expect(exerciseHref("ex-1", "/routines/r-1?plan=p-1")).toBe(
      "/library/ex-1?from=%2Froutines%2Fr-1%3Fplan%3Dp-1",
    );
  });
});

describe("exerciseReturnPath", () => {
  it("defaults to the library", () => {
    expect(exerciseReturnPath(undefined)).toBe("/library");
    expect(exerciseReturnPath("")).toBe("/library");
  });

  it("keeps a same-origin path with its query", () => {
    expect(exerciseReturnPath("/routines/r-1?plan=p-1")).toBe("/routines/r-1?plan=p-1");
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "/login"])(
    "refuses %s",
    (value) => {
      expect(exerciseReturnPath(value)).toBe("/library");
    },
  );
});
