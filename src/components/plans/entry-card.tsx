"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { DragHandle } from "@/components/routines/drag-handle";
import { StatusBadge } from "@/components/routines/status-badge";
import { Badge } from "@/components/ui/badge";
import type { SortableHandleProps } from "@/components/sortable/sortable-list";
import { cn } from "@/lib/utils";

export type EntryCardData = {
  id: string;
  label: string | null;
  routineId: string;
  routineName: string;
  routineStatus: "draft" | "active" | "archived";
  exerciseCount: number;
  /** How many entries (this plan or others) use the routine; the card flags it when above 1. */
  shared: number;
};

/** One routine on one day: label, name (links to the editor), size, shared flag and a menu. */
export function EntryCard({
  entry,
  planId,
  handle,
  menu,
  className,
}: {
  entry: EntryCardData;
  planId: string;
  /** Drag handle props; null renders no handle (the drag overlay, read-only previews). */
  handle: SortableHandleProps | null;
  menu: ReactNode;
  className?: string;
}) {
  const t = useTranslations("Plans.board.entry");
  return (
    <div className={cn("bg-card grid gap-1 rounded-lg border p-2 text-sm shadow-xs", className)}>
      <div className="flex items-start gap-1">
        {handle ? (
          <span className="hidden md:inline-flex">
            <DragHandle handle={handle} />
          </span>
        ) : null}
        <div className="grid min-w-0 flex-1 gap-0.5">
          {entry.label ? (
            <p className="text-muted-foreground truncate text-xs">{entry.label}</p>
          ) : null}
          <Link
            href={`/routines/${entry.routineId}?plan=${planId}`}
            className="focus-visible:ring-ring/30 line-clamp-2 rounded-sm font-medium outline-none hover:underline focus-visible:ring-2"
          >
            {entry.routineName}
          </Link>
          <p className="text-muted-foreground text-xs">
            {entry.exerciseCount > 0
              ? t("exercises", { count: entry.exerciseCount })
              : t("noExercises")}
          </p>
        </div>
        {menu}
      </div>
      {entry.shared > 1 || entry.routineStatus !== "active" ? (
        <div className="flex flex-wrap gap-1">
          {entry.shared > 1 ? (
            <Badge variant="secondary" title={t("sharedHint")}>
              {t("shared", { count: entry.shared })}
            </Badge>
          ) : null}
          {entry.routineStatus !== "active" ? <StatusBadge status={entry.routineStatus} /> : null}
        </div>
      ) : null}
    </div>
  );
}
