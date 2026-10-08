import { describe, expect, it } from "vitest";

import {
  buildCategoryTree,
  categoriesInTreeOrder,
  withCategory,
  type CategoryRow,
} from "./category-tree";

const row = (overrides: Partial<CategoryRow> & Pick<CategoryRow, "id">): CategoryRow => ({
  parentId: null,
  name: overrides.id,
  position: 0,
  activeCount: 0,
  totalCount: 0,
  ...overrides,
});

describe("buildCategoryTree", () => {
  it("nests children, sorts by position then name, and keeps each row's own counts", () => {
    const tree = buildCategoryTree([
      row({ id: "upper", position: 1, activeCount: 1, totalCount: 1 }),
      row({ id: "lower", position: 0, activeCount: 2, totalCount: 3 }),
      row({ id: "knee", parentId: "lower", position: 1, activeCount: 4, totalCount: 4 }),
      row({ id: "glutes", parentId: "lower", position: 0, activeCount: 1, totalCount: 2 }),
      row({ id: "ankle", parentId: "lower", position: 0, name: "Ankle" }),
    ]);
    expect(tree.map((node) => node.id)).toEqual(["lower", "upper"]);
    expect(tree[0].children.map((child) => child.id)).toEqual(["ankle", "glutes", "knee"]);
    // Rows already count their whole scope (an exercise can be in a parent and its child).
    expect(tree[0]).toMatchObject({ activeCount: 2, totalCount: 3 });
    expect(tree[0].children[2]).toEqual({
      id: "knee",
      name: "knee",
      position: 1,
      activeCount: 4,
      totalCount: 4,
    });
  });

  it("drops orphans whose parent is missing", () => {
    expect(buildCategoryTree([row({ id: "child", parentId: "gone" })])).toEqual([]);
  });
});

describe("withCategory", () => {
  const tree = buildCategoryTree([
    row({ id: "lower", name: "Lower limb" }),
    row({ id: "glutes", parentId: "lower", name: "Glutes" }),
    row({ id: "upper", name: "Upper limb", position: 1 }),
  ]);

  it("appends a new top-level category, empty and with no exercises", () => {
    const next = withCategory(tree, { id: "core", name: "Core", parentId: null });
    expect(next.map((node) => node.id)).toEqual(["lower", "upper", "core"]);
    expect(next[2]).toMatchObject({ name: "Core", activeCount: 0, totalCount: 0, children: [] });
    expect(tree).toHaveLength(2);
  });

  it("appends a sub-category to its parent", () => {
    const next = withCategory(tree, { id: "hams", name: "Hamstrings", parentId: "lower" });
    expect(next[0].children.map((child) => child.id)).toEqual(["glutes", "hams"]);
    expect(tree[0].children).toHaveLength(1);
  });

  it("leaves the tree alone when the category is already in it", () => {
    expect(withCategory(tree, { id: "glutes", name: "Glutes", parentId: "lower" })).toBe(tree);
    expect(withCategory(tree, { id: "upper", name: "Upper limb", parentId: null })).toBe(tree);
  });

  it("leaves the tree alone when the parent is gone", () => {
    expect(withCategory(tree, { id: "x", name: "X", parentId: "missing" })).toBe(tree);
  });
});

describe("categoriesInTreeOrder", () => {
  const tree = buildCategoryTree([
    row({ id: "upper", name: "Upper limb", position: 1 }),
    row({ id: "lower", name: "Lower limb" }),
    row({ id: "glutes", parentId: "lower", name: "Glutes" }),
    row({ id: "knee", parentId: "lower", name: "Knee", position: 1 }),
  ]);

  it("lists every category in tree order with its parent's name", () => {
    expect(categoriesInTreeOrder(tree)).toEqual([
      { id: "lower", name: "Lower limb", parent: null },
      { id: "glutes", name: "Glutes", parent: "Lower limb" },
      { id: "knee", name: "Knee", parent: "Lower limb" },
      { id: "upper", name: "Upper limb", parent: null },
    ]);
  });

  it("keeps only the given ids, in tree order, skipping unknown ones", () => {
    expect(categoriesInTreeOrder(tree, ["upper", "gone", "knee"]).map((c) => c.id)).toEqual([
      "knee",
      "upper",
    ]);
  });
});
