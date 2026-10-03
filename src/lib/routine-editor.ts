import {
  EMPTY_ITEM_PRESCRIPTION,
  EMPTY_SET,
  setSchema,
  type ItemPrescription,
  type SetPrescription,
} from "./prescription";
import { GROUP_MAX, GROUP_MIN, MAX_ITEMS, MAX_SETS } from "./routines";

/**
 * Pure editor state for the routine builder (spec 05). Blocks are either a single exercise or a
 * superset group of GROUP_MIN..GROUP_MAX consecutive exercises with equal set counts and one shared
 * rest. Every helper is immutable and returns the same array when it is a no-op. Keys are
 * client-only; a single block's key is its item's key.
 */

export type EditorSet = SetPrescription & { key: string };
export type ExerciseRef = {
  id: string;
  name: string;
  archived: boolean;
  cover: { videoId: string; isShort: boolean } | null;
};
export type EditorItem = ItemPrescription & {
  key: string;
  exerciseId: string;
  exerciseName: string;
  exerciseArchived: boolean;
  cover: { videoId: string; isShort: boolean } | null;
  sets: EditorSet[];
};
export type EditorBlock =
  | { kind: "single"; key: string; item: EditorItem }
  | { kind: "group"; key: string; restSeconds: number | null; items: EditorItem[] };
export type NewKey = () => string;

// Save payload (sent to the server action; keys are client-only, the server assigns ids).
export type SaveSet = SetPrescription;
export type SaveItem = ItemPrescription & {
  exerciseId: string;
  groupKey: string | null;
  sets: SaveSet[];
};
export type SaveGroup = { key: string; restSeconds: number | null };
export type SaveBlocks = { groups: SaveGroup[]; items: SaveItem[] };

// Loaded shape from the query.
export type LoadedItem = ItemPrescription & {
  id: string;
  exerciseId: string;
  exerciseName: string;
  exerciseArchived: boolean;
  cover: { videoId: string; isShort: boolean } | null;
  groupId: string | null;
  sets: SetPrescription[];
};
export type LoadedGroup = { id: string; restSeconds: number | null };

type GroupBlock = Extract<EditorBlock, { kind: "group" }>;

const blockItems = (block: EditorBlock): EditorItem[] =>
  block.kind === "single" ? [block.item] : block.items;

const singleBlock = (item: EditorItem): EditorBlock => ({ kind: "single", key: item.key, item });

const blockIndexOfItem = (blocks: EditorBlock[], itemKey: string) =>
  blocks.findIndex((block) => blockItems(block).some((item) => item.key === itemKey));

export function flatItems(blocks: EditorBlock[]): EditorItem[] {
  return blocks.flatMap(blockItems);
}

/** Keys of the items with a set the server schema would reject (e.g. max reps not above reps). */
export function itemsWithInvalidSets(blocks: EditorBlock[]): string[] {
  return flatItems(blocks)
    .filter((item) => item.sets.some((set) => !setSchema.safeParse(set).success))
    .map((item) => item.key);
}

export function itemCount(blocks: EditorBlock[]): number {
  return blocks.reduce((total, block) => total + blockItems(block).length, 0);
}

export function canAddItem(blocks: EditorBlock[]): boolean {
  return itemCount(blocks) < MAX_ITEMS;
}

const copySet = (set: SetPrescription, newKey: NewKey): EditorSet => ({
  reps: set.reps,
  repsMax: set.repsMax,
  durationSeconds: set.durationSeconds,
  load: set.load,
  distanceMeters: set.distanceMeters,
  intensity: set.intensity,
  key: newKey(),
});

export function newItem(exercise: ExerciseRef, newKey: NewKey): EditorItem {
  return {
    ...EMPTY_ITEM_PRESCRIPTION,
    key: newKey(),
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    exerciseArchived: exercise.archived,
    cover: exercise.cover,
    sets: [{ ...EMPTY_SET, key: newKey() }],
  };
}

export function addItem(blocks: EditorBlock[], item: EditorItem): EditorBlock[] {
  if (!canAddItem(blocks)) return blocks;
  return [...blocks, singleBlock(item)];
}

/** A group left with fewer than GROUP_MIN members dissolves; survivors inherit the group's rest. */
function dissolveIfSmall(block: GroupBlock): EditorBlock[] {
  if (block.items.length >= GROUP_MIN) return [block];
  return block.items.map((item) => singleBlock({ ...item, restSeconds: block.restSeconds }));
}

export function removeItem(blocks: EditorBlock[], itemKey: string): EditorBlock[] {
  const at = blockIndexOfItem(blocks, itemKey);
  if (at === -1) return blocks;
  const block = blocks[at];
  const replacement: EditorBlock[] =
    block.kind === "single"
      ? []
      : dissolveIfSmall({ ...block, items: block.items.filter((item) => item.key !== itemKey) });
  return [...blocks.slice(0, at), ...replacement, ...blocks.slice(at + 1)];
}

export function duplicateItem(
  blocks: EditorBlock[],
  itemKey: string,
  newKey: NewKey,
): EditorBlock[] {
  const at = blockIndexOfItem(blocks, itemKey);
  if (at === -1 || !canAddItem(blocks)) return blocks;
  const source = blockItems(blocks[at]).find((item) => item.key === itemKey)!;
  const copy: EditorItem = {
    ...source,
    key: newKey(),
    sets: source.sets.map((set) => copySet(set, newKey)),
  };
  return [...blocks.slice(0, at + 1), singleBlock(copy), ...blocks.slice(at + 1)];
}

/** Replaces one item, leaving every other block/item as the same reference. */
function mapItem(
  blocks: EditorBlock[],
  itemKey: string,
  fn: (item: EditorItem, inGroup: boolean) => EditorItem,
): EditorBlock[] {
  const at = blockIndexOfItem(blocks, itemKey);
  if (at === -1) return blocks;
  const block = blocks[at];
  const next: EditorBlock =
    block.kind === "single"
      ? { ...block, item: fn(block.item, false) }
      : {
          ...block,
          items: block.items.map((item) => (item.key === itemKey ? fn(item, true) : item)),
        };
  return [...blocks.slice(0, at), next, ...blocks.slice(at + 1)];
}

/** Applies `fn` to every member of the block holding `itemKey` (all members of a group). */
function mapBlockItems(
  blocks: EditorBlock[],
  itemKey: string,
  fn: (item: EditorItem) => EditorItem,
): EditorBlock[] {
  const at = blockIndexOfItem(blocks, itemKey);
  if (at === -1) return blocks;
  const block = blocks[at];
  const next: EditorBlock =
    block.kind === "single"
      ? { ...block, item: fn(block.item) }
      : { ...block, items: block.items.map(fn) };
  return [...blocks.slice(0, at), next, ...blocks.slice(at + 1)];
}

export function updateItem(
  blocks: EditorBlock[],
  itemKey: string,
  patch: Partial<ItemPrescription>,
): EditorBlock[] {
  return mapItem(blocks, itemKey, (item, inGroup) => {
    const { restSeconds, ...rest } = patch;
    return { ...item, ...rest, ...(inGroup || restSeconds === undefined ? {} : { restSeconds }) };
  });
}

export function updateSet(
  blocks: EditorBlock[],
  itemKey: string,
  setKey: string,
  patch: Partial<SetPrescription>,
): EditorBlock[] {
  return mapItem(blocks, itemKey, (item) => ({
    ...item,
    sets: item.sets.map((set) => (set.key === setKey ? { ...set, ...patch } : set)),
  }));
}

function findItem(blocks: EditorBlock[], itemKey: string): EditorItem | undefined {
  return flatItems(blocks).find((item) => item.key === itemKey);
}

/** Members of a group share their set count, so the block's largest count is the one that matters. */
function blockSetCount(blocks: EditorBlock[], itemKey: string): number {
  const at = blockIndexOfItem(blocks, itemKey);
  return at === -1 ? 0 : Math.max(...blockItems(blocks[at]).map((item) => item.sets.length));
}

export function canAddSet(blocks: EditorBlock[], itemKey: string): boolean {
  return findItem(blocks, itemKey) !== undefined && blockSetCount(blocks, itemKey) < MAX_SETS;
}

export function addSet(blocks: EditorBlock[], itemKey: string, newKey: NewKey): EditorBlock[] {
  if (!canAddSet(blocks, itemKey)) return blocks;
  return mapBlockItems(blocks, itemKey, (item) => ({
    ...item,
    sets: [...item.sets, copySet(item.sets[item.sets.length - 1] ?? EMPTY_SET, newKey)],
  }));
}

export function canRemoveSet(blocks: EditorBlock[], itemKey: string): boolean {
  const at = blockIndexOfItem(blocks, itemKey);
  if (at === -1) return false;
  const block = blocks[at];
  if (block.kind === "single") return block.item.sets.length > 0;
  return block.items.every((item) => item.sets.length > 1);
}

export function removeSet(blocks: EditorBlock[], itemKey: string, setKey: string): EditorBlock[] {
  const item = findItem(blocks, itemKey);
  if (!item || !canRemoveSet(blocks, itemKey)) return blocks;
  const index = item.sets.findIndex((set) => set.key === setKey);
  if (index === -1) return blocks;
  return mapBlockItems(blocks, itemKey, (member) => ({
    ...member,
    sets: member.sets.filter((_, i) => i !== index),
  }));
}

const groupIndex = (blocks: EditorBlock[], groupKey: string) =>
  blocks.findIndex((block) => block.kind === "group" && block.key === groupKey);

export function updateGroupRest(
  blocks: EditorBlock[],
  groupKey: string,
  restSeconds: number | null,
): EditorBlock[] {
  const at = groupIndex(blocks, groupKey);
  if (at === -1) return blocks;
  return [
    ...blocks.slice(0, at),
    { ...(blocks[at] as GroupBlock), restSeconds },
    ...blocks.slice(at + 1),
  ];
}

/** Reorders a group's members; `items` must be exactly the current members (by key). */
export function reorderGroupItems(
  blocks: EditorBlock[],
  groupKey: string,
  items: EditorItem[],
): EditorBlock[] {
  const at = groupIndex(blocks, groupKey);
  if (at === -1) return blocks;
  const block = blocks[at] as GroupBlock;
  const current = new Map(block.items.map((item) => [item.key, item]));
  const ordered = items.map((item) => current.get(item.key));
  const sameMembers =
    items.length === block.items.length &&
    new Set(items.map((item) => item.key)).size === items.length &&
    ordered.every((item) => item !== undefined);
  if (!sameMembers) return blocks;
  return [
    ...blocks.slice(0, at),
    { ...block, items: ordered as EditorItem[] },
    ...blocks.slice(at + 1),
  ];
}

/** Pads every item to the largest set count (at least 1) with copies of its own last set. */
function syncSetCounts(items: EditorItem[], newKey: NewKey): EditorItem[] {
  const target = Math.max(1, ...items.map((item) => item.sets.length));
  return items.map((item) => {
    if (item.sets.length === target) return item;
    const sets = [...item.sets];
    while (sets.length < target) sets.push(copySet(sets[sets.length - 1] ?? EMPTY_SET, newKey));
    return { ...item, sets };
  });
}

export function canGroupWithNext(blocks: EditorBlock[], blockKey: string): boolean {
  const at = blocks.findIndex((block) => block.key === blockKey);
  if (at === -1 || at === blocks.length - 1) return false;
  return blockItems(blocks[at]).length + blockItems(blocks[at + 1]).length <= GROUP_MAX;
}

export function groupWithNext(
  blocks: EditorBlock[],
  blockKey: string,
  newKey: NewKey,
): EditorBlock[] {
  if (!canGroupWithNext(blocks, blockKey)) return blocks;
  const at = blocks.findIndex((block) => block.key === blockKey);
  const left = blocks[at];
  const right = blocks[at + 1];
  const restOf = (block: EditorBlock) =>
    block.kind === "group" ? block.restSeconds : block.item.restSeconds;
  const key = left.kind === "group" ? left.key : newKey();
  const members = [...blockItems(left), ...blockItems(right)].map((item) => ({
    ...item,
    restSeconds: null,
  }));
  const merged: EditorBlock = {
    kind: "group",
    key,
    restSeconds: restOf(left) ?? restOf(right),
    items: syncSetCounts(members, newKey),
  };
  return [...blocks.slice(0, at), merged, ...blocks.slice(at + 2)];
}

export function ungroup(blocks: EditorBlock[], groupKey: string): EditorBlock[] {
  const at = groupIndex(blocks, groupKey);
  if (at === -1) return blocks;
  const block = blocks[at] as GroupBlock;
  const singles = block.items.map((item) =>
    singleBlock({ ...item, restSeconds: block.restSeconds }),
  );
  return [...blocks.slice(0, at), ...singles, ...blocks.slice(at + 1)];
}

export function toSaveBlocks(blocks: EditorBlock[]): SaveBlocks {
  const groups: SaveGroup[] = [];
  const items: SaveItem[] = [];
  for (const block of blocks) {
    const groupKey = block.kind === "group" ? block.key : null;
    if (block.kind === "group") groups.push({ key: block.key, restSeconds: block.restSeconds });
    for (const item of blockItems(block)) {
      items.push({
        exerciseId: item.exerciseId,
        groupKey,
        holdSeconds: item.holdSeconds,
        restSeconds: groupKey === null ? item.restSeconds : null,
        side: item.side,
        notes: item.notes,
        sets: item.sets.map((set) => ({
          reps: set.reps,
          repsMax: set.repsMax,
          durationSeconds: set.durationSeconds,
          load: set.load,
          distanceMeters: set.distanceMeters,
          intensity: set.intensity,
        })),
      });
    }
  }
  return { groups, items };
}

export function fromLoaded(
  items: LoadedItem[],
  groups: LoadedGroup[],
  newKey: NewKey,
): EditorBlock[] {
  const restByGroup = new Map(groups.map((group) => [group.id, group.restSeconds]));
  const toEditor = (item: LoadedItem, restSeconds: number | null): EditorItem => ({
    key: newKey(),
    exerciseId: item.exerciseId,
    exerciseName: item.exerciseName,
    exerciseArchived: item.exerciseArchived,
    cover: item.cover,
    holdSeconds: item.holdSeconds,
    restSeconds,
    side: item.side,
    notes: item.notes,
    sets: item.sets.map((set) => copySet(set, newKey)),
  });

  const blocks: EditorBlock[] = [];
  const usedGroupKeys = new Set<string>();
  let index = 0;
  while (index < items.length) {
    const { groupId } = items[index];
    let end = index + 1;
    if (groupId !== null) {
      while (end < items.length && items[end].groupId === groupId && end - index < GROUP_MAX) end++;
    }
    const run = items.slice(index, end);
    index = end;
    if (groupId === null || run.length < GROUP_MIN) {
      // A lone member of a group (corrupt data) becomes a single carrying the group's rest.
      for (const item of run) {
        blocks.push(
          singleBlock(
            toEditor(
              item,
              groupId === null ? item.restSeconds : (restByGroup.get(groupId) ?? null),
            ),
          ),
        );
      }
      continue;
    }
    // A group id split into several runs (corrupt data) must not reuse one block key.
    const key = usedGroupKeys.has(groupId) ? newKey() : groupId;
    usedGroupKeys.add(groupId);
    blocks.push({
      kind: "group",
      key,
      restSeconds: restByGroup.get(groupId) ?? null,
      items: syncSetCounts(
        run.map((item) => toEditor(item, null)),
        newKey,
      ),
    });
  }
  return blocks;
}
