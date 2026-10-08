import type { Route } from "next";
import { z } from "zod";

import { bodyAreaSchema, type BodyArea } from "./body-areas";
import { firstParam } from "./search-params";

/** /library filters, all reflected in the URL (`?q=&category=&area=&view=`). */
export type LibraryCategoryFilter =
  { kind: "all" } | { kind: "none" } | { kind: "archived" } | { kind: "category"; id: string };
export type LibraryView = "grid" | "list";
export type LibraryFilters = {
  q: string;
  area: BodyArea | null;
  category: LibraryCategoryFilter;
  view: LibraryView;
};

export const SEARCH_MAX_LENGTH = 100;
export const DEFAULT_LIBRARY_FILTERS: LibraryFilters = {
  q: "",
  area: null,
  category: { kind: "all" },
  view: "grid",
};

type Params = Record<string, string | string[] | undefined>;

export function parseLibraryParams(params: Params): LibraryFilters {
  const q = (firstParam(params.q) ?? "").trim().slice(0, SEARCH_MAX_LENGTH);
  const area = bodyAreaSchema.safeParse(firstParam(params.area));
  return {
    q,
    area: area.success ? area.data : null,
    category: parseCategory(firstParam(params.category)),
    view: firstParam(params.view) === "list" ? "list" : "grid",
  };
}

function parseCategory(value: string | undefined): LibraryCategoryFilter {
  if (value === "none" || value === "archived") return { kind: value };
  return z.uuid().safeParse(value).success ? { kind: "category", id: value! } : { kind: "all" };
}

export function libraryHref(filters: LibraryFilters, changes: Partial<LibraryFilters> = {}): Route {
  const next = { ...filters, ...changes };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.category.kind === "category") params.set("category", next.category.id);
  else if (next.category.kind !== "all") params.set("category", next.category.kind);
  if (next.area) params.set("area", next.area);
  if (next.view !== "grid") params.set("view", next.view);
  const query = params.toString();
  return (query ? `/library?${query}` : "/library") as Route;
}

export function hasActiveFilters(filters: LibraryFilters): boolean {
  return Boolean(filters.q || filters.area || filters.category.kind !== "all");
}
