/** Two-level exercise category tree (spec 03), built from flat rows with direct counts. */
export type CategoryRow = {
  id: string;
  parentId: string | null;
  name: string;
  position: number;
  /** Non-archived exercises filed directly under this category. */
  activeCount: number;
  /** All exercises (archived too) filed directly under this category. */
  totalCount: number;
};
export type CategoryLeaf = Omit<CategoryRow, "parentId">;
/** A top-level category; its counts include its sub-categories'. */
export type CategoryNode = CategoryLeaf & { children: CategoryLeaf[] };

const byPositionThenName = (a: CategoryLeaf, b: CategoryLeaf) =>
  a.position - b.position || a.name.localeCompare(b.name);

export function buildCategoryTree(rows: CategoryRow[]): CategoryNode[] {
  const leaf = (row: CategoryRow): CategoryLeaf => ({
    id: row.id,
    name: row.name,
    position: row.position,
    activeCount: row.activeCount,
    totalCount: row.totalCount,
  });
  const nodes = new Map<string, CategoryNode>(
    rows
      .filter((row) => row.parentId === null)
      .map((row) => [row.id, { ...leaf(row), children: [] }]),
  );
  for (const row of rows) {
    const parent = row.parentId === null ? undefined : nodes.get(row.parentId);
    if (!parent) continue;
    parent.children.push(leaf(row));
    parent.activeCount += row.activeCount;
    parent.totalCount += row.totalCount;
  }
  const tree = [...nodes.values()].sort(byPositionThenName);
  for (const node of tree) node.children.sort(byPositionThenName);
  return tree;
}

/**
 * The tree with a just-created category appended last among its siblings (where the server puts
 * it), so a picker can offer it before the refreshed tree arrives. Returns `tree` itself when the
 * category is already there or its parent is gone.
 */
export function withCategory(
  tree: CategoryNode[],
  category: { id: string; name: string; parentId: string | null },
): CategoryNode[] {
  const known = tree.some(
    (node) => node.id === category.id || node.children.some((child) => child.id === category.id),
  );
  if (known) return tree;
  const after = (siblings: CategoryLeaf[]) =>
    siblings.reduce((max, sibling) => Math.max(max, sibling.position + 1), 0);
  const leaf = (siblings: CategoryLeaf[]): CategoryLeaf => ({
    id: category.id,
    name: category.name,
    position: after(siblings),
    activeCount: 0,
    totalCount: 0,
  });
  if (category.parentId === null) return [...tree, { ...leaf(tree), children: [] }];
  if (!tree.some((node) => node.id === category.parentId)) return tree;
  return tree.map((node) =>
    node.id === category.parentId
      ? { ...node, children: [...node.children, leaf(node.children)] }
      : node,
  );
}
