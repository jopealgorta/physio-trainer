"use client";

import {
  ChevronDownIcon,
  DumbbellIcon,
  EllipsisVerticalIcon,
  GripVerticalIcon,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { YouTubeThumbnail } from "@/components/library/youtube-thumbnail";
import type { SortableHandleProps } from "@/components/sortable/sortable-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatPrescription } from "@/lib/prescription";
import {
  canAddItem,
  canGroupWithNext,
  duplicateItem,
  groupWithNext,
  removeItem,
  ungroup,
  type EditorBlock,
  type EditorItem,
  type NewKey,
} from "@/lib/routine-editor";
import { cn } from "@/lib/utils";

import { ItemEditor } from "./item-editor";
import { useSummaryTranslator } from "./prescription-summary";

/**
 * One exercise: cover, name, prescription summary, drag handle and an overflow menu, with the
 * prescription editor below when expanded. `groupKey` is set for members of a superset.
 */
export function ItemRow({
  blocks,
  item,
  groupKey,
  handle,
  expanded,
  onToggle,
  onChange,
  newKey,
}: {
  blocks: EditorBlock[];
  item: EditorItem;
  groupKey?: string;
  handle: SortableHandleProps;
  expanded: boolean;
  onToggle: () => void;
  onChange: (next: (blocks: EditorBlock[]) => EditorBlock[]) => void;
  newKey: NewKey;
}) {
  const t = useTranslations("Routines.items");
  const summarize = useSummaryTranslator();
  const grouped = groupKey !== undefined;
  const summary = formatPrescription(item, summarize);

  return (
    <div data-testid="item-row" className="bg-card min-w-0 rounded-lg border">
      <div className="flex min-w-0 items-center gap-2 p-2">
        <button
          type="button"
          {...handle}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 shrink-0 cursor-grab touch-none rounded-md p-1 outline-none focus-visible:ring-[3px]"
        >
          <GripVerticalIcon aria-hidden className="size-4" />
        </button>
        <div
          className={cn(
            "bg-muted text-muted-foreground flex shrink-0 items-center justify-center overflow-hidden rounded-md",
            item.cover?.isShort ? "aspect-[9/16] w-8" : "aspect-video w-14",
          )}
        >
          {item.cover ? (
            <YouTubeThumbnail videoId={item.cover.videoId} />
          ) : (
            <DumbbellIcon aria-hidden className="size-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium">{item.exerciseName}</span>
            {item.exerciseArchived ? <Badge variant="secondary">{t("archivedBadge")}</Badge> : null}
          </div>
          <p className="text-muted-foreground truncate text-xs">{summary || t("noPrescription")}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-expanded={expanded}
          aria-label={expanded ? t("collapse") : t("expand")}
          onClick={onToggle}
        >
          <ChevronDownIcon
            aria-hidden
            className={cn("transition-transform", expanded && "rotate-180")}
          />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label={t("menu")}>
              <EllipsisVerticalIcon aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              disabled={!canAddItem(blocks)}
              onSelect={() => onChange((current) => duplicateItem(current, item.key, newKey))}
            >
              {t("duplicate")}
            </DropdownMenuItem>
            {grouped ? (
              <DropdownMenuItem onSelect={() => onChange((current) => ungroup(current, groupKey))}>
                {t("ungroup")}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                disabled={!canGroupWithNext(blocks, item.key)}
                onSelect={() => onChange((current) => groupWithNext(current, item.key, newKey))}
              >
                {t("groupWithNext")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <Link href={`/library/${item.exerciseId}`}>{t("openExercise")}</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => onChange((current) => removeItem(current, item.key))}
            >
              {t("remove")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {expanded ? (
        <div className="border-t p-3">
          <ItemEditor
            blocks={blocks}
            item={item}
            grouped={grouped}
            onChange={onChange}
            newKey={newKey}
          />
        </div>
      ) : null}
    </div>
  );
}
