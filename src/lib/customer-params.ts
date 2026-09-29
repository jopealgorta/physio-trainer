import type { Route } from "next";

import { firstParam } from "./search-params";

export type CustomerSort = "name" | "recent";
/** /customers filters, all reflected in the URL (`?q=&archived=1&sort=recent`). */
export type CustomerFilters = { q: string; archived: boolean; sort: CustomerSort };

export const CUSTOMER_SEARCH_MAX_LENGTH = 100;
export const DEFAULT_CUSTOMER_FILTERS: CustomerFilters = { q: "", archived: false, sort: "name" };

type Params = Record<string, string | string[] | undefined>;

export function parseCustomerParams(params: Params): CustomerFilters {
  return {
    q: (firstParam(params.q) ?? "").trim().slice(0, CUSTOMER_SEARCH_MAX_LENGTH),
    archived: firstParam(params.archived) === "1",
    sort: firstParam(params.sort) === "recent" ? "recent" : "name",
  };
}

export function hasActiveCustomerFilters(filters: CustomerFilters): boolean {
  return filters.q !== "" || filters.archived;
}

export function customersHref(
  filters: CustomerFilters,
  changes: Partial<CustomerFilters> = {},
): Route {
  const next = { ...filters, ...changes };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.archived) params.set("archived", "1");
  if (next.sort !== "name") params.set("sort", next.sort);
  const query = params.toString();
  return (query ? `/customers?${query}` : "/customers") as Route;
}
