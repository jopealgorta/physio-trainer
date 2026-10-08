/**
 * Two-level exercise category tree (spec 03), built from flat rows. Counts are distinct exercises
 * filed under the category or, for a top-level one, any of its sub-categories.
 */
export type CategoryRow = {
  id: string;
  parentId: string | null;
  name: string;
  position: number;
  /** Non-archived exercises filed under this category or its sub-categories. */
  activeCount: number;
  /** All exercises (archived too) filed under this category or its sub-categories. */
  totalCount: number;
};
export type CategoryLeaf = Omit<CategoryRow, "parentId">;
/** A top-level category with its sub-categories. */
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

export type FlatCategory = { id: string; name: string; parent: string | null };

/**
 * Categories in tree order (each top-level one, then its sub-categories), each with its parent's
 * name. With `ids`, only those categories; ids not in the tree are skipped.
 */
export function categoriesInTreeOrder(
  tree: CategoryNode[],
  ids?: readonly string[],
): FlatCategory[] {
  const wanted = ids ? new Set(ids) : null;
  const flat: FlatCategory[] = [];
  for (const node of tree) {
    flat.push({ id: node.id, name: node.name, parent: null });
    for (const child of node.children) {
      flat.push({ id: child.id, name: child.name, parent: node.name });
    }
  }
  return wanted ? flat.filter((category) => wanted.has(category.id)) : flat;
}
