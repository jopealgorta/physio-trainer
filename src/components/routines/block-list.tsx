"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useTranslations } from "next-intl";

import { SortableRow } from "@/components/sortable/sortable-list";
import type { EditorBlock, NewKey } from "@/lib/routine-editor";
import { cn } from "@/lib/utils";

import { GroupCard } from "./group-card";
import { ItemRow } from "./item-row";

/** A section a block can be moved to ("Move to section"). */
export type SectionTarget = { key: string; name: string };

/** Drag data on a block row and on an empty section's drop zone (see `SectionList`). */
export type BlockDragData = { type: "block" | "empty"; sectionKey: string };

/** The `SortableContext` id of a section's blocks. */
export const blockContainerId = (sectionKey: string) => `blocks:${sectionKey}`;
/** The droppable id of an empty section. */
export const dropZoneId = (sectionKey: string) => `drop:${sectionKey}`;

/**
 * One section's blocks, in order. A block moves as a unit (single exercise or whole superset);
 * a superset's members reorder only inside its card, so a drag can never split a group. The
 * `DndContext` belongs to the section list, so blocks can be dragged into other sections; an empty
 * section shows a drop zone instead.
 */
export function BlockList({
  sectionKey,
  blocks,
  onChange,
  newKey,
  expanded,
  invalid,
  onToggle,
  canAddItem,
  targets,
  onMoveTo,
  onDuplicate,
  routineEmpty,
}: {
  sectionKey: string;
  blocks: EditorBlock[];
  /** Updates this section's blocks; row actions pass updaters, so they apply to the latest. */
  onChange: (next: (blocks: EditorBlock[]) => EditorBlock[]) => void;
  newKey: NewKey;
  /** Item keys whose prescription editor is open. */
  expanded: ReadonlySet<string>;
  /** Item keys to flag because a set would be rejected on save. */
  invalid: ReadonlySet<string>;
  onToggle: (itemKey: string) => void;
  /** The routine is under its exercise cap (counted across every section). */
  canAddItem: boolean;
  /** The other sections; empty hides "Move to section". */
  targets: SectionTarget[];
  onMoveTo: (blockKey: string, sectionKey: string) => void;
  onDuplicate: (itemKey: string) => void;
  /** No section has exercises: the empty section points at the picker instead. */
  routineEmpty: boolean;
}) {
  const t = useTranslations("Routines.items");
  const tSections = useTranslations("Routines.sections");
  const tSortable = useTranslations("Sortable");
  const empty = blocks.length === 0;
  const { setNodeRef, isOver } = useDroppable({
    id: dropZoneId(sectionKey),
    data: { type: "empty", sectionKey } satisfies BlockDragData,
    disabled: !empty,
  });

  if (empty) {
    return (
      <div
        ref={setNodeRef}
        className={cn(
          "text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm",
          isOver && "border-primary bg-primary/5",
        )}
      >
        {routineEmpty ? t("empty") : tSections("dropHere")}
      </div>
    );
  }

  const label = (block: EditorBlock) =>
    block.kind === "single" ? block.item.exerciseName : t("superset");
  const data: BlockDragData = { type: "block", sectionKey };

  return (
    <SortableContext
      id={blockContainerId(sectionKey)}
      items={blocks.map((block) => block.key)}
      strategy={verticalListSortingStrategy}
    >
      <ul className="grid grid-cols-1 gap-2">
        {blocks.map((block) => (
          <SortableRow
            key={block.key}
            id={block.key}
            data={data}
            handleLabel={tSortable("handle", { item: label(block) })}
          >
            {(handle) =>
              block.kind === "single" ? (
                <ItemRow
                  blocks={blocks}
                  item={block.item}
                  handle={handle}
                  expanded={expanded.has(block.item.key)}
                  invalid={invalid.has(block.item.key)}
                  onToggle={() => onToggle(block.item.key)}
                  onChange={onChange}
                  newKey={newKey}
                  canAddItem={canAddItem}
                  onDuplicate={() => onDuplicate(block.item.key)}
                  targets={targets}
                  onMoveTo={(to) => onMoveTo(block.key, to)}
                />
              ) : (
                <GroupCard
                  blocks={blocks}
                  block={block}
                  handle={handle}
                  onChange={onChange}
                  newKey={newKey}
                  targets={targets}
                  onMoveTo={(to) => onMoveTo(block.key, to)}
                  renderMember={(item, memberHandle) => (
                    <ItemRow
                      blocks={blocks}
                      item={item}
                      groupKey={block.key}
                      handle={memberHandle}
                      expanded={expanded.has(item.key)}
                      invalid={invalid.has(item.key)}
                      onToggle={() => onToggle(item.key)}
                      onChange={onChange}
                      newKey={newKey}
                      canAddItem={canAddItem}
                      onDuplicate={() => onDuplicate(item.key)}
                    />
                  )}
                />
              )
            }
          </SortableRow>
        ))}
      </ul>
    </SortableContext>
  );
}
