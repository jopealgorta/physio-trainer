"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type Active,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DroppableContainer,
  type KeyboardCoordinateGetter,
  type Over,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useTranslations } from "next-intl";
import { useId, useRef, type Dispatch, type SetStateAction } from "react";

import { SortableRow } from "@/components/sortable/sortable-list";
import type { EditorBlock, NewKey } from "@/lib/routine-editor";
import {
  addSection,
  canAddSection,
  duplicateItemIn,
  moveBlockToSection,
  moveSection,
  removeSection,
  renameSection,
  reorderSections,
  sectionKeyOfBlock,
  totalItems,
  updateSectionBlocks,
  type EditorSection,
} from "@/lib/routine-sections";
import { MAX_ITEMS } from "@/lib/routines";

import { AddSection } from "./add-section";
import { BlockList, type BlockDragData } from "./block-list";
import { SectionCard } from "./section-card";

type SectionDragData = { type: "section"; sectionKey: string };
type DragData = SectionDragData | BlockDragData;

/** Section ids are prefixed so they never collide with block keys in the shared context. */
const sectionDragId = (key: string) => `section:${key}`;

/** The drag data of an active item, a drag target or a registered droppable. */
const dragData = (node: { data: { current?: unknown } } | null | undefined) =>
  node?.data.current as (DragData & { sortable?: { containerId: UniqueIdentifier } }) | undefined;

/**
 * Sections drop onto sections; blocks onto blocks and empty sections. A block follows the pointer
 * when it is over one, and the closest target otherwise (keyboard drags have no pointer).
 */
const collisionDetection: CollisionDetection = (args) => {
  const draggingSection = dragData(args.active)?.type === "section";
  const droppableContainers = args.droppableContainers.filter(
    (container) => (dragData(container)?.type === "section") === draggingSection,
  );
  const scoped = { ...args, droppableContainers };
  if (!draggingSection) {
    const within = pointerWithin(scoped);
    if (within.length > 0) return within;
  }
  return closestCenter(scoped);
};

/**
 * The arrow keys move a section among sections and a block among its own section's blocks
 * ("Move to section" in the block's menu is the keyboard way to another section).
 */
const keyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  const { active, droppableContainers } = args.context;
  const own = dragData(active);
  const entries = [...droppableContainers.entries()].filter(([, container]) => {
    const data = dragData(container);
    return own?.type === "section"
      ? data?.type === "section"
      : data?.type === "block" && data.sortable?.containerId === own?.sortable?.containerId;
  });
  // The context's map has helpers (`getEnabled`) the sortable getter relies on: build another.
  const Scoped = droppableContainers.constructor as new (
    scoped: [UniqueIdentifier, DroppableContainer][],
  ) => typeof droppableContainers;
  return sortableKeyboardCoordinates(event, {
    ...args,
    context: { ...args.context, droppableContainers: new Scoped(entries) },
  });
};

/**
 * The routine's sections in order, each a card holding its blocks, plus "Add section". One drag
 * context serves both levels: a section's handle reorders sections, a block's handle moves it within
 * its section or into another one (superset members keep their own nested list).
 */
export function SectionList({
  sections,
  onChange,
  newKey,
  expanded,
  invalid,
  onToggle,
}: {
  sections: EditorSection[];
  /** A state setter: actions pass updaters, so they always apply to the latest sections. */
  onChange: Dispatch<SetStateAction<EditorSection[]>>;
  newKey: NewKey;
  /** Item keys whose prescription editor is open. */
  expanded: ReadonlySet<string>;
  /** Item keys to flag because a set would be rejected on save. */
  invalid: ReadonlySet<string>;
  onToggle: (itemKey: string) => void;
}) {
  const t = useTranslations("Routines.sections");
  const tItems = useTranslations("Routines.items");
  const tSortable = useTranslations("Sortable");
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }),
  );
  // The sections when the drag started: a cancelled drag puts a block back where it was.
  const before = useRef<EditorSection[] | null>(null);

  const total = totalItems(sections);
  const canAddItem = total < MAX_ITEMS;

  const blockName = (block: EditorBlock) =>
    block.kind === "single" ? block.item.exerciseName : tItems("superset");
  const sectionAt = (key: unknown) =>
    sections.findIndex((section) => sectionDragId(section.key) === key);
  /** Where a drag target is: its section and its 1-based position there. */
  const place = (over: Over) => {
    const data = dragData(over);
    if (data?.type === "section") {
      return { section: null, position: sectionAt(over.id) + 1, total: sections.length };
    }
    const section = sections.find((candidate) => candidate.key === data?.sectionKey);
    const index = section?.blocks.findIndex((block) => block.key === over.id) ?? -1;
    return {
      section: section?.name ?? "",
      position: index + 1 || 1,
      total: Math.max(section?.blocks.length ?? 0, 1),
    };
  };
  const nameOf = (active: Active) => {
    if (dragData(active)?.type === "section") return sections[sectionAt(active.id)]?.name ?? "";
    const block = sections.flatMap((section) => section.blocks).find((b) => b.key === active.id);
    return block ? blockName(block) : "";
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => tSortable("picked", { item: nameOf(active) }),
    onDragOver: ({ active, over }) => {
      if (!over) return undefined;
      const { section, position, total } = place(over);
      const item = nameOf(active);
      return section === null
        ? tSortable("moved", { item, position, total })
        : t("movedTo", { item, section, position, total });
    },
    onDragEnd: ({ active, over }) => {
      if (!over) return undefined;
      const { section, position, total } = place(over);
      const item = nameOf(active);
      return section === null
        ? tSortable("dropped", { item, position, total })
        : t("droppedIn", { item, section, position, total });
    },
    onDragCancel: ({ active }) => tSortable("cancelled", { item: nameOf(active) }),
  };

  /** A block dragged over another section joins it at once, so its rows make room. */
  function onDragOver({ active, over }: DragOverEvent) {
    const target = dragData(over);
    if (!over || dragData(active)?.type !== "block" || !target || target.type === "section") {
      return;
    }
    const blockKey = String(active.id);
    const translated = active.rect.current.translated;
    const below = translated !== null && translated.top > over.rect.top + over.rect.height / 2;
    onChange((current) => {
      const from = sectionKeyOfBlock(current, blockKey);
      const to = current.find((section) => section.key === target.sectionKey);
      if (from === null || !to || from === to.key) return current;
      const at = to.blocks.findIndex((block) => block.key === over.id);
      const index = target.type === "block" && at !== -1 ? at + (below ? 1 : 0) : undefined;
      return moveBlockToSection(current, blockKey, to.key, index);
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    before.current = null;
    if (!over || active.id === over.id) return;
    const moving = dragData(active);
    const target = dragData(over);
    if (moving?.type === "section" && target?.type === "section") {
      onChange((current) => {
        const from = current.findIndex((s) => sectionDragId(s.key) === active.id);
        const to = current.findIndex((s) => sectionDragId(s.key) === over.id);
        if (from === -1 || to === -1) return current;
        return reorderSections(current, arrayMove(current, from, to));
      });
    } else if (moving?.type === "block" && target?.type === "block") {
      onChange((current) => {
        const key = sectionKeyOfBlock(current, String(active.id));
        if (key === null || key !== sectionKeyOfBlock(current, String(over.id))) return current;
        return updateSectionBlocks(current, key, (blocks) =>
          arrayMove(
            blocks,
            blocks.findIndex((block) => block.key === active.id),
            blocks.findIndex((block) => block.key === over.id),
          ),
        );
      });
    }
  }

  function onDragCancel() {
    if (before.current) onChange(before.current);
    before.current = null;
  }

  return (
    <div className="grid min-w-0 gap-4">
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={() => {
          before.current = sections;
        }}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: tSortable("instructions") },
        }}
      >
        <SortableContext
          items={sections.map((section) => sectionDragId(section.key))}
          strategy={verticalListSortingStrategy}
        >
          <ul className="grid grid-cols-1 gap-4">
            {sections.map((section, index) => (
              <SortableRow
                key={section.key}
                id={sectionDragId(section.key)}
                data={{ type: "section", sectionKey: section.key } satisfies SectionDragData}
                handleLabel={tSortable("handle", { item: section.name })}
              >
                {(handle) => (
                  <SectionCard
                    name={section.name}
                    itemCount={totalItems([section])}
                    index={index}
                    count={sections.length}
                    handle={handle}
                    onRename={(name) =>
                      onChange((current) => renameSection(current, section.key, name))
                    }
                    onMove={(delta) =>
                      onChange((current) => moveSection(current, section.key, delta))
                    }
                    onDelete={() => onChange((current) => removeSection(current, section.key))}
                  >
                    <BlockList
                      sectionKey={section.key}
                      blocks={section.blocks}
                      onChange={(fn) =>
                        onChange((current) => updateSectionBlocks(current, section.key, fn))
                      }
                      newKey={newKey}
                      expanded={expanded}
                      invalid={invalid}
                      onToggle={onToggle}
                      canAddItem={canAddItem}
                      targets={sections
                        .filter((other) => other.key !== section.key)
                        .map(({ key, name }) => ({ key, name }))}
                      onMoveTo={(blockKey, to) =>
                        onChange((current) => moveBlockToSection(current, blockKey, to))
                      }
                      onDuplicate={(itemKey) =>
                        onChange((current) => duplicateItemIn(current, itemKey, newKey))
                      }
                      routineEmpty={total === 0}
                    />
                  </SectionCard>
                )}
              </SortableRow>
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {canAddItem ? null : (
        <p className="text-muted-foreground text-xs">{tItems("limit", { max: MAX_ITEMS })}</p>
      )}
      <AddSection
        full={!canAddSection(sections)}
        onAdd={(name) => onChange((current) => addSection(current, name, newKey))}
      />
    </div>
  );
}
