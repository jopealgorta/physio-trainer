import type { Route } from "next";
import { z } from "zod";

import { ROUTINE_SEARCH_MAX_LENGTH, ROUTINE_STATUSES, type RoutineStatus } from "./routines";
import { firstParam } from "./search-params";
import { parseListTab, type ListTab } from "./templates";

/** /routines filters, all reflected in the URL (`?tab=templates&q=&status=active&customer=<uuid>`). */
export type RoutineFilters = {
  q: string;
  status: RoutineStatus | "all";
  customerId: string | null;
  tab: ListTab;
};

export const DEFAULT_ROUTINE_FILTERS: RoutineFilters = {
  q: "",
  status: "all",
  customerId: null,
  tab: "customers",
};

type Params = Record<string, string | string[] | undefined>;

function parseStatus(value: string | undefined): RoutineFilters["status"] {
  return ROUTINE_STATUSES.find((status) => status === value) ?? "all";
}

export function parseRoutineParams(params: Params): RoutineFilters {
  const customer = firstParam(params.customer);
  const tab = parseListTab(firstParam(params.tab));
  const status = parseStatus(firstParam(params.status));
  return {
    q: (firstParam(params.q) ?? "").trim().slice(0, ROUTINE_SEARCH_MAX_LENGTH),
    // Templates are never drafts, so that filter would only ever show nothing.
    status: tab === "templates" && status === "draft" ? "all" : status,
    customerId:
      tab === "customers" && customer && z.uuid().safeParse(customer).success ? customer : null,
    tab,
  };
}

export function hasActiveRoutineFilters(filters: RoutineFilters): boolean {
  return filters.q !== "" || filters.status !== "all" || filters.customerId !== null;
}

export function routinesHref(
  filters: RoutineFilters,
  changes: Partial<RoutineFilters> = {},
): Route {
  const next = { ...filters, ...changes };
  const params = new URLSearchParams();
  if (next.tab === "templates") params.set("tab", "templates");
  if (next.q) params.set("q", next.q);
  if (next.status !== "all") params.set("status", next.status);
  if (next.customerId && next.tab === "customers") params.set("customer", next.customerId);
  const query = params.toString();
  return (query ? `/routines?${query}` : "/routines") as Route;
}
