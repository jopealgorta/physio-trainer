import { describe, expect, it } from "vitest";

import {
  DEFAULT_LIBRARY_FILTERS,
  hasActiveFilters,
  libraryHref,
  parseLibraryParams,
} from "./library-params";

const UUID = "0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10";

describe("parseLibraryParams", () => {
  it("defaults everything", () => {
    expect(parseLibraryParams({})).toEqual(DEFAULT_LIBRARY_FILTERS);
  });

  it("reads every filter", () => {
    expect(
      parseLibraryParams({
        q: "  bridge ",
        area: "knee",
        category: UUID,
        view: "list",
      }),
    ).toEqual({
      q: "bridge",
      area: "knee",
      category: { kind: "category", id: UUID },
      view: "list",
    });
  });

  it("takes the first of repeated values", () => {
    expect(parseLibraryParams({ area: ["knee", "neck"] }).area).toBe("knee");
  });

  it.each([
    [{ area: "elbowz" }, "area", null],
    [{ category: "not-a-uuid" }, "category", { kind: "all" }],
    [{ category: "none" }, "category", { kind: "none" }],
    [{ category: "archived" }, "category", { kind: "archived" }],
    [{ view: "table" }, "view", "grid"],
  ] as const)("sanitises %j", (params, key, expected) => {
    expect(parseLibraryParams(params)[key]).toEqual(expected);
  });

  it("ignores the old tag param", () => {
    expect(parseLibraryParams({ tag: "band" })).toEqual(DEFAULT_LIBRARY_FILTERS);
  });

  it("caps the search length", () => {
    expect(parseLibraryParams({ q: "a".repeat(500) }).q).toHaveLength(100);
  });
});

describe("libraryHref", () => {
  it("omits defaults", () => {
    expect(libraryHref(DEFAULT_LIBRARY_FILTERS)).toBe("/library");
  });

  it("serialises filters in a stable order and applies changes", () => {
    const filters = parseLibraryParams({ q: "bridge", view: "list" });
    expect(libraryHref(filters, { category: { kind: "category", id: UUID }, area: "knee" })).toBe(
      `/library?q=bridge&category=${UUID}&area=knee&view=list`,
    );
    expect(libraryHref(filters, { category: { kind: "archived" } })).toBe(
      "/library?q=bridge&category=archived&view=list",
    );
  });

  it("round-trips through parseLibraryParams", () => {
    const filters = parseLibraryParams({ q: "élévation & co", category: "none", area: "neck" });
    const href = libraryHref(filters);
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(parseLibraryParams(params)).toEqual(filters);
  });
});

describe("hasActiveFilters", () => {
  it("ignores the view", () => {
    expect(hasActiveFilters({ ...DEFAULT_LIBRARY_FILTERS, view: "list" })).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_LIBRARY_FILTERS, area: "knee" })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_LIBRARY_FILTERS, category: { kind: "none" } })).toBe(true);
  });
});
