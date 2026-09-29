import { describe, expect, it } from "vitest";

import {
  customersHref,
  DEFAULT_CUSTOMER_FILTERS,
  hasActiveCustomerFilters,
  parseCustomerParams,
} from "./customer-params";
import { parseCustomerTab } from "./customers";

describe("parseCustomerParams", () => {
  it("defaults", () => {
    expect(parseCustomerParams({})).toEqual(DEFAULT_CUSTOMER_FILTERS);
  });
  it("parses q, archived and sort; ignores junk", () => {
    expect(parseCustomerParams({ q: "  ana ", archived: "1", sort: "recent" })).toEqual({
      q: "ana",
      archived: true,
      sort: "recent",
    });
    expect(parseCustomerParams({ archived: "yes", sort: "bogus" })).toEqual(
      DEFAULT_CUSTOMER_FILTERS,
    );
    expect(parseCustomerParams({ q: ["a", "b"] }).q).toBe("a");
    expect(parseCustomerParams({ q: "x".repeat(300) }).q).toHaveLength(100);
  });
});

describe("customersHref / hasActiveCustomerFilters", () => {
  it("omits defaults", () => {
    expect(customersHref(DEFAULT_CUSTOMER_FILTERS)).toBe("/customers");
    expect(
      customersHref(DEFAULT_CUSTOMER_FILTERS, { q: "ana", archived: true, sort: "recent" }),
    ).toBe("/customers?q=ana&archived=1&sort=recent");
  });
  it("flags active filters", () => {
    expect(hasActiveCustomerFilters(DEFAULT_CUSTOMER_FILTERS)).toBe(false);
    expect(hasActiveCustomerFilters({ ...DEFAULT_CUSTOMER_FILTERS, q: "a" })).toBe(true);
    expect(hasActiveCustomerFilters({ ...DEFAULT_CUSTOMER_FILTERS, archived: true })).toBe(true);
  });
});

describe("parseCustomerTab", () => {
  it("falls back to overview", () => {
    expect(parseCustomerTab("routines")).toBe("routines");
    expect(parseCustomerTab("nope")).toBe("overview");
    expect(parseCustomerTab(undefined)).toBe("overview");
  });
});
