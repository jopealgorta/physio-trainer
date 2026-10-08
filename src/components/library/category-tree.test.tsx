import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import type { CategoryNode } from "@/lib/category-tree";
import { DEFAULT_LIBRARY_FILTERS, type LibraryFilters } from "@/lib/library-params";

import messages from "../../../messages/en.json";
import { CategoryTree } from "./category-tree";

const leaf = (id: string, name: string, count: number) => ({
  id,
  name,
  position: 0,
  activeCount: count,
  totalCount: count,
});
const tree: CategoryNode[] = [
  { ...leaf("c1", "Lower limb", 5), children: [leaf("c2", "Glutes", 3)] },
  { ...leaf("c3", "Upper limb", 1), children: [] },
];

function ui(filters: Partial<LibraryFilters> = {}) {
  return (
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <CategoryTree tree={tree} filters={{ ...DEFAULT_LIBRARY_FILTERS, ...filters }} />
    </NextIntlClientProvider>
  );
}
function setup(filters: Partial<LibraryFilters> = {}) {
  return render(ui(filters));
}

describe("CategoryTree", () => {
  it("links every category, plus all, uncategorised and archived", () => {
    setup();
    const nav = screen.getByRole("navigation", { name: "Categories" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /All exercises/ })).toHaveAttribute("href", "/library");
    expect(screen.getByRole("link", { name: /Uncategorised/ })).toHaveAttribute(
      "href",
      "/library?category=none",
    );
    expect(screen.getByRole("link", { name: /Lower limb/ })).toHaveAttribute(
      "href",
      "/library?category=c1",
    );
    expect(screen.getByRole("link", { name: /Upper limb/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Archived" })).toHaveAttribute(
      "href",
      "/library?category=archived",
    );
  });

  it("shows the active count", () => {
    setup();
    expect(screen.getByRole("link", { name: /Lower limb/ })).toHaveTextContent("5");
  });

  it("marks the current category and keeps the other filters in links", () => {
    setup({ category: { kind: "none" }, area: "knee", view: "list" });
    expect(screen.getByRole("link", { name: /Uncategorised/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: /All exercises/ })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: /Uncategorised/ })).toHaveAttribute(
      "href",
      "/library?category=none&area=knee&view=list",
    );
  });

  it("toggles sub-categories", async () => {
    const user = userEvent.setup();
    setup();
    const toggle = screen.getByRole("button", { name: "Sub-categories of Lower limb" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: /Glutes/ })).not.toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: /Glutes/ })).toBeInTheDocument();
    await user.click(toggle);
    expect(screen.queryByRole("link", { name: /Glutes/ })).not.toBeInTheDocument();
  });

  it("starts expanded on the branch of the active sub-category", () => {
    setup({ category: { kind: "category", id: "c2" } });
    expect(screen.getByRole("link", { name: /Glutes/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Sub-categories of Lower limb" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("expands the branch when the URL later points at a sub-category", () => {
    const { rerender } = setup();
    expect(screen.queryByRole("link", { name: /Glutes/ })).not.toBeInTheDocument();
    rerender(ui({ category: { kind: "category", id: "c2" } }));
    expect(screen.getByRole("link", { name: /Glutes/ })).toHaveAttribute("aria-current", "page");
  });
});
