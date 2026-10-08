import {
  duplicateItem,
  fromLoaded,
  toSaveBlocks,
  type EditorBlock,
  type EditorItem,
  type LoadedGroup,
  type LoadedItem,
  type NewKey,
  type SaveBlocks,
} from "./routine-editor";
import { MAX_ITEMS, MAX_SECTIONS, SECTION_NAME_MAX } from "./routines";

/**
 * Pure editor state for routine sections (spec 22): an ordered list of named sections, each holding
 * the spec 05 blocks. Every helper is immutable and returns the same array when it is a no-op.
 */

export type EditorSection = { key: string; name: string; blocks: EditorBlock[] };
export type SaveSection = { key: string; name: string };
export type LoadedSection = { id: string; name: string };

const blockItems = (block: EditorBlock): EditorItem[] =>
  block.kind === "single" ? [block.item] : block.items;

const validName = (name: string): string | null => {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= SECTION_NAME_MAX ? trimmed : null;
};

export function newSection(name: string, newKey: NewKey): EditorSection {
  return { key: newKey(), name, blocks: [] };
}

export function allBlocks(sections: EditorSection[]): EditorBlock[] {
  return sections.flatMap((section) => section.blocks);
}

export function totalItems(sections: EditorSection[]): number {
  return allBlocks(sections).reduce((total, block) => total + blockItems(block).length, 0);
}

export function canAddSection(sections: EditorSection[]): boolean {
  return sections.length < MAX_SECTIONS;
}

export function addSection(
  sections: EditorSection[],
  name: string,
  newKey: NewKey,
): EditorSection[] {
  const valid = validName(name);
  if (valid === null || !canAddSection(sections)) return sections;
  return [...sections, newSection(valid, newKey)];
}

export function renameSection(
  sections: EditorSection[],
  key: string,
  name: string,
): EditorSection[] {
  const valid = validName(name);
  if (valid === null || !sections.some((section) => section.key === key)) return sections;
  return sections.map((section) => (section.key === key ? { ...section, name: valid } : section));
}

export function removeSection(sections: EditorSection[], key: string): EditorSection[] {
  if (sections.length <= 1 || !sections.some((section) => section.key === key)) return sections;
  return sections.filter((section) => section.key !== key);
}

export function moveSection(
  sections: EditorSection[],
  key: string,
  delta: -1 | 1,
): EditorSection[] {
  const at = sections.findIndex((section) => section.key === key);
  const to = at + delta;
  if (at === -1 || to < 0 || to >= sections.length) return sections;
  const next = [...sections];
  [next[at], next[to]] = [next[to], next[at]];
  return next;
}

/** Reorders sections; `ordered` must be exactly the current sections (by key). */
export function reorderSections(
  sections: EditorSection[],
  ordered: EditorSection[],
): EditorSection[] {
  const current = new Map(sections.map((section) => [section.key, section]));
  const mapped = ordered.map((section) => current.get(section.key));
  const sameMembers =
    ordered.length === sections.length &&
    new Set(ordered.map((section) => section.key)).size === ordered.length &&
    mapped.every((section) => section !== undefined);
  if (!sameMembers) return sections;
  return mapped as EditorSection[];
}

export function updateSectionBlocks(
  sections: EditorSection[],
  key: string,
  fn: (blocks: EditorBlock[]) => EditorBlock[],
): EditorSection[] {
  const at = sections.findIndex((section) => section.key === key);
  if (at === -1) return sections;
  const blocks = fn(sections[at].blocks);
  if (blocks === sections[at].blocks) return sections;
  return sections.map((section, i) => (i === at ? { ...section, blocks } : section));
}

export function sectionKeyOfBlock(sections: EditorSection[], blockKey: string): string | null {
  return sections.find((section) => section.blocks.some((b) => b.key === blockKey))?.key ?? null;
}

/** Moves a whole block (a single or a superset) to `index` of another section; appends by default. */
export function moveBlockToSection(
  sections: EditorSection[],
  blockKey: string,
  toKey: string,
  index?: number,
): EditorSection[] {
  const fromKey = sectionKeyOfBlock(sections, blockKey);
  if (fromKey === null || !sections.some((section) => section.key === toKey)) return sections;
  const block = sections
    .find((section) => section.key === fromKey)!
    .blocks.find((b) => b.key === blockKey)!;
  return sections.map((section) => {
    let blocks = section.blocks;
    if (section.key === fromKey) blocks = blocks.filter((b) => b.key !== blockKey);
    if (section.key === toKey) {
      const at = index === undefined ? blocks.length : Math.max(0, Math.min(index, blocks.length));
      blocks = [...blocks.slice(0, at), block, ...blocks.slice(at)];
    }
    return blocks === section.blocks ? section : { ...section, blocks };
  });
}

/** Appends a single block for `item` to the last section (the picker's target), under the total cap. */
export function addItemToLast(sections: EditorSection[], item: EditorItem): EditorSection[] {
  if (sections.length === 0 || totalItems(sections) >= MAX_ITEMS) return sections;
  const last = sections[sections.length - 1];
  const block: EditorBlock = { kind: "single", key: item.key, item };
  return [...sections.slice(0, -1), { ...last, blocks: [...last.blocks, block] }];
}

export function duplicateItemIn(
  sections: EditorSection[],
  itemKey: string,
  newKey: NewKey,
): EditorSection[] {
  if (totalItems(sections) >= MAX_ITEMS) return sections;
  const section = sections.find((s) =>
    s.blocks.some((block) => blockItems(block).some((item) => item.key === itemKey)),
  );
  if (!section) return sections;
  return updateSectionBlocks(sections, section.key, (blocks) =>
    duplicateItem(blocks, itemKey, newKey),
  );
}

export function toSaveSections(
  sections: EditorSection[],
): SaveBlocks & { sections: SaveSection[] } {
  const groups: SaveBlocks["groups"] = [];
  const items: SaveBlocks["items"] = [];
  for (const section of sections) {
    const saved = toSaveBlocks(section.blocks, section.key);
    groups.push(...saved.groups);
    items.push(...saved.items);
  }
  return {
    sections: sections.map(({ key, name }) => ({ key, name })),
    groups,
    items,
  };
}

/**
 * Buckets loaded items by section (null or unknown section → the first) and runs the spec 05
 * `fromLoaded` on each bucket, so a group never crosses a section boundary. No sections yields one
 * section named `defaultName`.
 */
export function fromLoadedSections(
  items: LoadedItem[],
  groups: LoadedGroup[],
  sections: LoadedSection[],
  defaultName: string,
  newKey: NewKey,
): EditorSection[] {
  const base: { id: string | null; name: string }[] =
    sections.length > 0 ? sections : [{ id: null, name: defaultName }];
  const known = new Set(sections.map((section) => section.id));
  return base.map((section, index) => {
    const bucket = items.filter((item) =>
      index === 0 && (item.sectionId === null || !known.has(item.sectionId))
        ? true
        : item.sectionId === section.id,
    );
    return {
      key: newKey(),
      name: section.name,
      blocks: fromLoaded(bucket, groups, newKey),
    };
  });
}

/** Patient/export helper: every block of every section, in order. */
export function flattenSections<B>(sections: { blocks: B[] }[]): B[] {
  return sections.flatMap((section) => section.blocks);
}

/** Drops empty sections; headings show only with two or more non-empty ones. */
export function visibleSections<S extends { blocks: unknown[] }>(
  sections: S[],
): { sections: S[]; headings: boolean } {
  const visible = sections.filter((section) => section.blocks.length > 0);
  return { sections: visible, headings: visible.length >= 2 };
}
