import { describe, expect, it } from "vitest";

import { libraryLayoutState } from "./library-layout";

describe("libraryLayoutState", () => {
  it("is full-page empty with no categories, exercises or filters", () => {
    expect(
      libraryLayoutState({
        hasCategories: false,
        hasExercises: false,
        hasAnyExercises: false,
        filtersActive: false,
      }),
    ).toBe("empty-page");
  });
  it("keeps the tree when categories exist but the library is empty", () => {
    expect(
      libraryLayoutState({
        hasCategories: true,
        hasExercises: false,
        hasAnyExercises: false,
        filtersActive: false,
      }),
    ).toBe("empty-column");
  });
  it("shows no-results when filters match nothing", () => {
    expect(
      libraryLayoutState({
        hasCategories: false,
        hasExercises: false,
        hasAnyExercises: false,
        filtersActive: true,
      }),
    ).toBe("no-results");
  });
  it("shows results when there are exercises", () => {
    expect(
      libraryLayoutState({
        hasCategories: true,
        hasExercises: true,
        hasAnyExercises: true,
        filtersActive: true,
      }),
    ).toBe("results");
  });
  it("keeps the tree when only archived exercises exist and there are no categories", () => {
    expect(
      libraryLayoutState({
        hasCategories: false,
        hasExercises: false,
        hasAnyExercises: true,
        filtersActive: false,
      }),
    ).toBe("empty-column");
  });
});
