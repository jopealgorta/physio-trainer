"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

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
}: {
  blocks: EditorBlock[];
  onChange: (blocks: EditorBlock[]) => void;
  newKey: NewKey;
}) {
  const t = useTranslations("Routines.items");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const apply = (next: (blocks: EditorBlock[]) => EditorBlock[]) => onChange(next(blocks));
  const toggle = (key: string) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (!next.delete(key)) next.add(key);
      return next;
    });

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
              onToggle={() => toggle(block.item.key)}
              onChange={apply}
              newKey={newKey}
            />
          ) : (
            <GroupCard
              blocks={blocks}
              block={block}
              handle={handle}
              onChange={apply}
              newKey={newKey}
              renderMember={(item, memberHandle) => (
                <ItemRow
                  blocks={blocks}
                  item={item}
                  groupKey={block.key}
                  handle={memberHandle}
                  expanded={expanded.has(item.key)}
                  onToggle={() => toggle(item.key)}
                  onChange={apply}
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
