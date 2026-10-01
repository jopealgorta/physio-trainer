import type { Route } from "next";
import { z } from "zod";

import { ROUTINE_SEARCH_MAX_LENGTH, ROUTINE_STATUSES, type RoutineStatus } from "./routines";
import { firstParam } from "./search-params";
import { parseListTab, type ListTab } from "./templates";

/** /plans filters, all reflected in the URL (`?tab=templates&q=&status=active&customer=<uuid>`). */
export type PlanFilters = {
  q: string;
  status: RoutineStatus | "all";
  customerId: string | null;
  tab: ListTab;
};

export const DEFAULT_PLAN_FILTERS: PlanFilters = {
  q: "",
  status: "all",
  customerId: null,
  tab: "customers",
};

type Params = Record<string, string | string[] | undefined>;

export function parsePlanParams(params: Params): PlanFilters {
  const customer = firstParam(params.customer);
  const status = firstParam(params.status);
  const tab = parseListTab(firstParam(params.tab));
  return {
    q: (firstParam(params.q) ?? "").trim().slice(0, ROUTINE_SEARCH_MAX_LENGTH),
    status: ROUTINE_STATUSES.find((candidate) => candidate === status) ?? "all",
    customerId:
      tab === "customers" && customer && z.uuid().safeParse(customer).success ? customer : null,
    tab,
  };
}

export function hasActivePlanFilters(filters: PlanFilters): boolean {
  return filters.q !== "" || filters.status !== "all" || filters.customerId !== null;
}

export function plansHref(filters: PlanFilters, changes: Partial<PlanFilters> = {}): Route {
  const next = { ...filters, ...changes };
  const params = new URLSearchParams();
  if (next.tab === "templates") params.set("tab", "templates");
  if (next.q) params.set("q", next.q);
  if (next.status !== "all") params.set("status", next.status);
  if (next.customerId && next.tab === "customers") params.set("customer", next.customerId);
  const query = params.toString();
  return (query ? `/plans?${query}` : "/plans") as Route;
}
