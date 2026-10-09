"use client";

import { ChevronDownIcon, DumbbellIcon, EllipsisVerticalIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatPrescription } from "@/lib/prescription";
import {
  canGroupWithNext,
  groupWithNext,
  removeItem,
  ungroup,
  type EditorBlock,
  type EditorItem,
  type NewKey,
} from "@/lib/routine-editor";
import { exerciseHref } from "@/lib/exercise-return";
import { cn } from "@/lib/utils";

import type { SectionTarget } from "./block-list";
import { DragHandle } from "./drag-handle";
import { ItemEditor } from "./item-editor";
import { useSummaryTranslator } from "./prescription-summary";

/**
 * One exercise: cover, name, prescription summary, drag handle and an overflow menu, with the
 * prescription editor below when expanded. `groupKey` is set for members of a superset, which
 * move to another section with their whole card, so they get no "Move to section".
 */
export function ItemRow({
  blocks,
  item,
  groupKey,
  handle,
  expanded,
  invalid = false,
  onToggle,
  onChange,
  newKey,
  canAddItem,
  onDuplicate,
  targets = [],
  onMoveTo,
}: {
  /** The blocks of this item's section. */
  blocks: EditorBlock[];
  item: EditorItem;
  groupKey?: string;
  handle: SortableHandleProps;
  expanded: boolean;
  /** A set would be rejected on save (shown as a badge, also while collapsed). */
  invalid?: boolean;
  onToggle: () => void;
  onChange: (next: (blocks: EditorBlock[]) => EditorBlock[]) => void;
  newKey: NewKey;
  /** The routine is under its exercise cap (counted across sections). */
  canAddItem: boolean;
  onDuplicate: () => void;
  /** Other sections this (single) exercise can move to. */
  targets?: SectionTarget[];
  onMoveTo?: (sectionKey: string) => void;
}) {
  const t = useTranslations("Routines.items");
  // The exercise page returns here after saving (or cancelling).
  const pathname = usePathname();
  const query = useSearchParams()?.toString();
  const here = pathname ? `${pathname}${query ? `?${query}` : ""}` : undefined;
  const tSections = useTranslations("Routines.sections");
  const tLibrary = useTranslations("Library");
  const summarize = useSummaryTranslator();
  const grouped = groupKey !== undefined;
  const summary = formatPrescription(item, summarize);

  return (
    <div
      data-testid="item-row"
      className={cn("bg-card min-w-0 rounded-lg border", invalid && "border-destructive")}
    >
      <div className="flex min-w-0 items-center gap-2 p-2">
        <DragHandle handle={handle} />
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
            {item.exerciseKind === "aerobic" ? (
              <Badge variant="secondary">{tLibrary("kindBadge.aerobic")}</Badge>
            ) : null}
            {item.exerciseArchived ? <Badge variant="secondary">{t("archivedBadge")}</Badge> : null}
            {invalid ? <Badge variant="destructive">{t("invalidBadge")}</Badge> : null}
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
            <DropdownMenuItem disabled={!canAddItem} onSelect={onDuplicate}>
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
            {!grouped && onMoveTo && targets.length > 0 ? (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>{tSections("moveTo")}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-w-64">
                  {targets.map((target) => (
                    <DropdownMenuItem key={target.key} onSelect={() => onMoveTo(target.key)}>
                      <span className="truncate">{target.name}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ) : null}
            <DropdownMenuItem asChild>
              <Link href={exerciseHref(item.exerciseId, here) as Route}>{t("openExercise")}</Link>
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
