"use client";

import { useTranslations } from "next-intl";
import type { Dispatch, SetStateAction } from "react";

import { SortableList } from "@/components/sortable/sortable-list";
import { itemCount, type EditorBlock, type NewKey } from "@/lib/routine-editor";
import { MAX_ITEMS } from "@/lib/routines";

import { GroupCard } from "./group-card";
import { ItemRow } from "./item-row";

/**
 * The routine's blocks, in order. A block moves as a unit (single exercise or whole superset);
 * a superset's members reorder only inside its card, so a drag can never split a group.
 */
export function BlockList({
  blocks,
  onChange,
  newKey,
  expanded,
  invalid,
  onToggle,
}: {
  blocks: EditorBlock[];
  /** A state setter: row actions pass updaters, so they always apply to the latest blocks. */
  onChange: Dispatch<SetStateAction<EditorBlock[]>>;
  newKey: NewKey;
  /** Item keys whose prescription editor is open. */
  expanded: ReadonlySet<string>;
  /** Item keys to flag because a set would be rejected on save. */
  invalid: ReadonlySet<string>;
  onToggle: (itemKey: string) => void;
}) {
  const t = useTranslations("Routines.items");

  if (blocks.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("empty")}</p>;
  }

  return (
    <div className="grid min-w-0 gap-2">
      <SortableList
        items={blocks}
        onReorder={onChange}
        label={(block) => (block.kind === "single" ? block.item.exerciseName : t("superset"))}
        className="grid grid-cols-1 gap-2"
        renderItem={(block, handle) =>
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
            />
          ) : (
            <GroupCard
              blocks={blocks}
              block={block}
              handle={handle}
              onChange={onChange}
              newKey={newKey}
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
                />
              )}
            />
          )
        }
      />
      {itemCount(blocks) >= MAX_ITEMS ? (
        <p className="text-muted-foreground text-xs">{t("limit", { max: MAX_ITEMS })}</p>
      ) : null}
    </div>
  );
}
