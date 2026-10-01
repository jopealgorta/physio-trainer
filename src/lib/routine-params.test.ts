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
      tab: "customers",
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
  it("reads the tab and drops the customer filter on the templates tab", () => {
    expect(parseRoutineParams({ tab: "templates", customer: CUSTOMER })).toEqual({
      ...DEFAULT_ROUTINE_FILTERS,
      tab: "templates",
      customerId: null,
    });
    expect(parseRoutineParams({ tab: "bogus" }).tab).toBe("customers");
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
    expect(
      routinesHref({ q: "knee", status: "all", customerId: null, tab: "customers" }, { q: "" }),
    ).toBe("/routines");
  });
  it("writes tab=templates only for templates and never a customer", () => {
    expect(routinesHref(DEFAULT_ROUTINE_FILTERS, { tab: "templates", q: "acl" })).toBe(
      "/routines?tab=templates&q=acl",
    );
    expect(routinesHref(DEFAULT_ROUTINE_FILTERS, { tab: "templates", customerId: CUSTOMER })).toBe(
      "/routines?tab=templates",
    );
  });
  it("flags active filters", () => {
    expect(hasActiveRoutineFilters(DEFAULT_ROUTINE_FILTERS)).toBe(false);
    expect(hasActiveRoutineFilters({ ...DEFAULT_ROUTINE_FILTERS, q: "a" })).toBe(true);
    expect(hasActiveRoutineFilters({ ...DEFAULT_ROUTINE_FILTERS, status: "draft" })).toBe(true);
    expect(hasActiveRoutineFilters({ ...DEFAULT_ROUTINE_FILTERS, customerId: CUSTOMER })).toBe(
      true,
    );
    expect(hasActiveRoutineFilters({ ...DEFAULT_ROUTINE_FILTERS, tab: "templates" })).toBe(false);
  });
});
