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
