import type { Route } from "next";
import { z } from "zod";

import { bodyAreaSchema, type BodyArea } from "./body-areas";
import { firstParam } from "./search-params";
import { MAX_TAG_LENGTH, normalizeTag } from "./tags";

/** /library filters, all reflected in the URL (`?q=&category=&area=&tag=&view=`). */
export type LibraryCategoryFilter =
  { kind: "all" } | { kind: "none" } | { kind: "archived" } | { kind: "category"; id: string };
export type LibraryView = "grid" | "list";
export type LibraryFilters = {
  q: string;
  area: BodyArea | null;
  tag: string | null;
  category: LibraryCategoryFilter;
  view: LibraryView;
};

export const SEARCH_MAX_LENGTH = 100;
export const DEFAULT_LIBRARY_FILTERS: LibraryFilters = {
  q: "",
  area: null,
  tag: null,
  category: { kind: "all" },
  view: "grid",
};

type Params = Record<string, string | string[] | undefined>;

export function parseLibraryParams(params: Params): LibraryFilters {
  const q = (firstParam(params.q) ?? "").trim().slice(0, SEARCH_MAX_LENGTH);
  const area = bodyAreaSchema.safeParse(firstParam(params.area));
  const tag = normalizeTag(firstParam(params.tag) ?? "");
  return {
    q,
    area: area.success ? area.data : null,
    tag: tag && tag.length <= MAX_TAG_LENGTH ? tag : null,
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
  if (next.tag) params.set("tag", next.tag);
  if (next.view !== "grid") params.set("view", next.view);
  const query = params.toString();
  return (query ? `/library?${query}` : "/library") as Route;
}

export function hasActiveFilters(filters: LibraryFilters): boolean {
  return Boolean(filters.q || filters.area || filters.tag || filters.category.kind !== "all");
}
