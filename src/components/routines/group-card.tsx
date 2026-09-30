"use client";

import { LayersIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";

import { SortableList, type SortableHandleProps } from "@/components/sortable/sortable-list";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { itemShape, PRESCRIPTION_LIMITS } from "@/lib/prescription";
import {
  canGroupWithNext,
  groupWithNext,
  reorderGroupItems,
  ungroup,
  updateGroupRest,
  type EditorBlock,
  type EditorItem,
  type NewKey,
} from "@/lib/routine-editor";

import { DragHandle } from "./drag-handle";
import { NumberField } from "./number-field";

/** A superset: shared rest, group-level actions and its members, which reorder only within it. */
export function GroupCard({
  blocks,
  block,
  handle,
  onChange,
  newKey,
  renderMember,
}: {
  blocks: EditorBlock[];
  block: Extract<EditorBlock, { kind: "group" }>;
  handle: SortableHandleProps;
  onChange: (next: (blocks: EditorBlock[]) => EditorBlock[]) => void;
  newKey: NewKey;
  renderMember: (item: EditorItem, handle: SortableHandleProps) => ReactNode;
}) {
  const t = useTranslations("Routines.items");
  const id = useId();

  return (
    <div
      role="group"
      aria-label={t("superset")}
      className="bg-muted/30 grid min-w-0 gap-3 rounded-lg border border-dashed p-2"
    >
      <div className="grid min-w-0 gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <DragHandle handle={handle} />
          <LayersIcon aria-hidden className="text-primary size-4" />
          <span className="text-sm font-medium">{t("superset")}</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canGroupWithNext(blocks, block.key)}
              onClick={() => onChange((current) => groupWithNext(current, block.key, newKey))}
            >
              {t("groupWithNext")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange((current) => ungroup(current, block.key))}
            >
              {t("ungroup")}
            </Button>
          </div>
        </div>
        <p className="text-muted-foreground text-xs">{t("supersetHint")}</p>
        <div className="grid min-w-0 gap-2 sm:max-w-56">
          <Label htmlFor={`${id}-rest`}>{t("groupRest")}</Label>
          <NumberField
            id={`${id}-rest`}
            value={block.restSeconds}
            schema={itemShape.restSeconds}
            limits={PRESCRIPTION_LIMITS.restSeconds}
            onValueChange={(rest) =>
              onChange((current) => updateGroupRest(current, block.key, rest))
            }
          />
        </div>
      </div>
      <SortableList
        items={block.items}
        onReorder={(items) => onChange((current) => reorderGroupItems(current, block.key, items))}
        label={(item) => item.exerciseName}
        className="grid grid-cols-1 gap-2"
        renderItem={renderMember}
      />
    </div>
  );
}
