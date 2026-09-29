import { describe, expect, it } from "vitest";

import { buildCategoryTree, type CategoryRow } from "./category-tree";

const row = (overrides: Partial<CategoryRow> & Pick<CategoryRow, "id">): CategoryRow => ({
  parentId: null,
  name: overrides.id,
  position: 0,
  activeCount: 0,
  totalCount: 0,
  ...overrides,
});

describe("buildCategoryTree", () => {
  it("nests children, sorts by position then name, and sums counts into parents", () => {
    const tree = buildCategoryTree([
      row({ id: "upper", position: 1, activeCount: 1, totalCount: 1 }),
      row({ id: "lower", position: 0, activeCount: 2, totalCount: 3 }),
      row({ id: "knee", parentId: "lower", position: 1, activeCount: 4, totalCount: 4 }),
      row({ id: "glutes", parentId: "lower", position: 0, activeCount: 1, totalCount: 2 }),
      row({ id: "ankle", parentId: "lower", position: 0, name: "Ankle" }),
    ]);
    expect(tree.map((node) => node.id)).toEqual(["lower", "upper"]);
    expect(tree[0].children.map((child) => child.id)).toEqual(["ankle", "glutes", "knee"]);
    expect(tree[0]).toMatchObject({ activeCount: 7, totalCount: 9 });
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
