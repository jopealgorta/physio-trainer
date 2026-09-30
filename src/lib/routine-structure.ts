import { GROUP_MAX, GROUP_MIN } from "./routines";

export type StructureGroup = { key: string; restSeconds: number | null };
export type StructureItem = {
  groupKey: string | null;
  restSeconds: number | null;
  setCount: number;
};
export type StructureIssue =
  | "unknownGroup"
  | "unusedGroup"
  | "duplicateGroup"
  | "groupSize"
  | "groupNotConsecutive"
  | "groupSetsMismatch"
  | "groupNeedsSets"
  | "groupItemRest";

/** Superset rules (spec 05): the editor keeps them true, the save action re-checks them. */
export function validateStructure(
  groups: StructureGroup[],
  items: StructureItem[],
): StructureIssue[] {
  const issues = new Set<StructureIssue>();
  const keys = new Set<string>();
  for (const group of groups) {
    if (keys.has(group.key)) issues.add("duplicateGroup");
    keys.add(group.key);
  }
  const positions = new Map<string, number[]>();
  items.forEach((item, index) => {
    if (item.groupKey === null) return;
    if (!keys.has(item.groupKey)) return void issues.add("unknownGroup");
    positions.set(item.groupKey, [...(positions.get(item.groupKey) ?? []), index]);
    if (item.restSeconds !== null) issues.add("groupItemRest");
  });
  for (const key of keys) {
    const at = positions.get(key);
    if (!at) {
      issues.add("unusedGroup");
      continue;
    }
    if (at.length < GROUP_MIN || at.length > GROUP_MAX) issues.add("groupSize");
    if (at[at.length - 1] - at[0] !== at.length - 1) issues.add("groupNotConsecutive");
    const counts = at.map((index) => items[index].setCount);
    if (counts.some((count) => count === 0)) issues.add("groupNeedsSets");
    else if (new Set(counts).size > 1) issues.add("groupSetsMismatch");
  }
  return [...issues];
}
