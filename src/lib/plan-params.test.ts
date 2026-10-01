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
      tab: "customers",
    });
  });

  it("reads the tab and drops the customer filter on the templates tab", () => {
    expect(parsePlanParams({ tab: "templates", customer: CUSTOMER })).toEqual({
      ...DEFAULT_PLAN_FILTERS,
      tab: "templates",
      customerId: null,
    });
    expect(parsePlanParams({ tab: "bogus" }).tab).toBe("customers");
  });

  it("drops the draft status on the templates tab, where nothing is a draft", () => {
    expect(parsePlanParams({ tab: "templates", status: "draft" }).status).toBe("all");
    expect(parsePlanParams({ tab: "templates", status: "archived" }).status).toBe("archived");
    expect(parsePlanParams({ status: "draft" }).status).toBe("draft");
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
    expect(plansHref(DEFAULT_PLAN_FILTERS, { tab: "templates", q: "acl" })).toBe(
      "/plans?tab=templates&q=acl",
    );
    expect(plansHref(DEFAULT_PLAN_FILTERS, { tab: "templates", customerId: CUSTOMER })).toBe(
      "/plans?tab=templates",
    );
    expect(hasActivePlanFilters({ ...DEFAULT_PLAN_FILTERS, tab: "templates" })).toBe(false);
    expect(hasActivePlanFilters(DEFAULT_PLAN_FILTERS)).toBe(false);
    expect(hasActivePlanFilters({ ...DEFAULT_PLAN_FILTERS, customerId: CUSTOMER })).toBe(true);
  });
});
