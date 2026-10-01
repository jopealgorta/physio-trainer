"use client";

import { MoreVerticalIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

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
import { WEEKDAYS, weekdayName } from "@/lib/plans";

export type EntryMenuActions = {
  editLabel: () => void;
  moveTo: (weekday: number) => void;
  copyTo: (weekday: number) => void;
  moveUp: () => void;
  moveDown: () => void;
  separateCopy: () => void;
  remove: () => void;
};

/**
 * Everything the board can do to one entry. This is the whole interaction on touch screens
 * (where the drag handle is hidden) and the keyboard/assistive fallback to dragging.
 */
export function EntryMenu({
  routineName,
  routineHref,
  weekday,
  fullDays,
  canMoveUp,
  canMoveDown,
  actions,
}: {
  routineName: string;
  routineHref: Route;
  weekday: number;
  /** Weekdays that already hold the most routines a day can have. */
  fullDays: ReadonlySet<number>;
  canMoveUp: boolean;
  canMoveDown: boolean;
  actions: EntryMenuActions;
}) {
  const t = useTranslations("Plans.board.entry");
  const locale = useLocale();
  const dayLabel = (day: number) =>
    fullDays.has(day) && day !== weekday
      ? `${weekdayName(locale, day as 1)} · ${t("dayFull")}`
      : weekdayName(locale, day as 1);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("menu", { routine: routineName })}
          className="shrink-0"
        >
          <MoreVerticalIcon aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem onSelect={actions.editLabel}>{t("editLabel")}</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>{t("moveTo")}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {WEEKDAYS.map((day) => (
              <DropdownMenuItem
                key={day}
                disabled={day === weekday || fullDays.has(day)}
                onSelect={() => actions.moveTo(day)}
              >
                {dayLabel(day)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>{t("copyTo")}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {WEEKDAYS.map((day) => (
              <DropdownMenuItem
                key={day}
                disabled={fullDays.has(day)}
                onSelect={() => actions.copyTo(day)}
              >
                {dayLabel(day)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem disabled={!canMoveUp} onSelect={actions.moveUp}>
          {t("moveUp")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canMoveDown} onSelect={actions.moveDown}>
          {t("moveDown")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={actions.separateCopy}>{t("separateCopy")}</DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={routineHref}>{t("open")}</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={actions.remove}>
          {t("remove")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
