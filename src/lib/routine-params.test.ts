import { describe, expect, it } from "vitest";

import {
  DEFAULT_ROUTINE_FILTERS,
  hasActiveRoutineFilters,
  parseRoutineParams,
  routinesHref,
} from "./routine-params";

const CUSTOMER = "123e4567-e89b-42d3-a456-426614174000";

describe("parseRoutineParams", () => {
  it("defaults", () => {
    expect(parseRoutineParams({})).toEqual(DEFAULT_ROUTINE_FILTERS);
  });
  it("parses q, status and customer", () => {
    expect(parseRoutineParams({ q: "  knee ", status: "active", customer: CUSTOMER })).toEqual({
      q: "knee",
      status: "active",
      customerId: CUSTOMER,
    });
    expect(parseRoutineParams({ status: "draft" }).status).toBe("draft");
    expect(parseRoutineParams({ status: "archived" }).status).toBe("archived");
  });
  it("falls back to defaults for junk", () => {
    expect(parseRoutineParams({ status: "bogus", customer: "not-a-uuid" })).toEqual(
      DEFAULT_ROUTINE_FILTERS,
    );
    expect(parseRoutineParams({ status: "all" }).status).toBe("all");
    expect(parseRoutineParams({ q: ["a", "b"] }).q).toBe("a");
  });
  it("caps q at 100 characters", () => {
    expect(parseRoutineParams({ q: "x".repeat(300) }).q).toHaveLength(100);
  });
});

describe("routinesHref / hasActiveRoutineFilters", () => {
  it("omits defaults", () => {
    expect(routinesHref(DEFAULT_ROUTINE_FILTERS)).toBe("/routines");
    expect(
      routinesHref(DEFAULT_ROUTINE_FILTERS, { q: "knee", status: "active", customerId: CUSTOMER }),
    ).toBe(`/routines?q=knee&status=active&customer=${CUSTOMER}`);
    expect(routinesHref({ q: "knee", status: "all", customerId: null }, { q: "" })).toBe(
      "/routines",
    );
  });
  it("flags active filters", () => {
    expect(hasActiveRoutineFilters(DEFAULT_ROUTINE_FILTERS)).toBe(false);
    expect(hasActiveRoutineFilters({ ...DEFAULT_ROUTINE_FILTERS, q: "a" })).toBe(true);
    expect(hasActiveRoutineFilters({ ...DEFAULT_ROUTINE_FILTERS, status: "draft" })).toBe(true);
    expect(hasActiveRoutineFilters({ ...DEFAULT_ROUTINE_FILTERS, customerId: CUSTOMER })).toBe(
      true,
    );
  });
});
