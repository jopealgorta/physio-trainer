import { describe, expect, it } from "vitest";

import {
  DEFAULT_PLAN_FILTERS,
  hasActivePlanFilters,
  parsePlanParams,
  plansHref,
} from "./plan-params";

const CUSTOMER = "123e4567-e89b-42d3-a456-426614174000";

describe("parsePlanParams", () => {
  it("defaults", () => {
    expect(parsePlanParams({})).toEqual(DEFAULT_PLAN_FILTERS);
  });

  it("parses q, status and customer", () => {
    expect(parsePlanParams({ q: "  week ", status: "active", customer: CUSTOMER })).toEqual({
      q: "week",
      status: "active",
      customerId: CUSTOMER,
    });
  });

  it("falls back to defaults for junk and takes the first of repeated params", () => {
    expect(parsePlanParams({ status: "bogus", customer: "nope" })).toEqual(DEFAULT_PLAN_FILTERS);
    expect(parsePlanParams({ q: ["a", "b"] }).q).toBe("a");
    expect(parsePlanParams({ q: "x".repeat(300) }).q).toHaveLength(100);
  });
});

describe("plansHref / hasActivePlanFilters", () => {
  it("omits defaults and applies changes", () => {
    expect(plansHref(DEFAULT_PLAN_FILTERS)).toBe("/plans");
    expect(plansHref(DEFAULT_PLAN_FILTERS, { status: "draft", q: "a b" })).toBe(
      "/plans?q=a+b&status=draft",
    );
    expect(hasActivePlanFilters(DEFAULT_PLAN_FILTERS)).toBe(false);
    expect(hasActivePlanFilters({ ...DEFAULT_PLAN_FILTERS, customerId: CUSTOMER })).toBe(true);
  });
});
