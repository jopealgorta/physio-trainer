import type { Route } from "next";
import { z } from "zod";

import { ROUTINE_SEARCH_MAX_LENGTH, ROUTINE_STATUSES, type RoutineStatus } from "./routines";
import { firstParam } from "./search-params";

/** /plans filters, all reflected in the URL (`?q=&status=active&customer=<uuid>`). */
export type PlanFilters = {
  q: string;
  status: RoutineStatus | "all";
  customerId: string | null;
};

export const DEFAULT_PLAN_FILTERS: PlanFilters = { q: "", status: "all", customerId: null };

type Params = Record<string, string | string[] | undefined>;

export function parsePlanParams(params: Params): PlanFilters {
  const customer = firstParam(params.customer);
  const status = firstParam(params.status);
  return {
    q: (firstParam(params.q) ?? "").trim().slice(0, ROUTINE_SEARCH_MAX_LENGTH),
    status: ROUTINE_STATUSES.find((candidate) => candidate === status) ?? "all",
    customerId: customer && z.uuid().safeParse(customer).success ? customer : null,
  };
}

export function hasActivePlanFilters(filters: PlanFilters): boolean {
  return filters.q !== "" || filters.status !== "all" || filters.customerId !== null;
}

export function plansHref(filters: PlanFilters, changes: Partial<PlanFilters> = {}): Route {
  const next = { ...filters, ...changes };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.status !== "all") params.set("status", next.status);
  if (next.customerId) params.set("customer", next.customerId);
  const query = params.toString();
  return (query ? `/plans?${query}` : "/plans") as Route;
}
