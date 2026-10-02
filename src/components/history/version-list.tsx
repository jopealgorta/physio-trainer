"use client";

import { useFormatter, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { VersionMeta } from "@/server/history/schemas";

import { SummaryText } from "./summary-text";

/** "Mar 3, 2026, 10:00 AM" for a version's ISO timestamp, in the active locale and time zone. */
export function useVersionDate(): (iso: string) => string {
  const format = useFormatter();
  return (iso) => format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" });
}

/** The versions, newest (the current one) first; each row opens that version. */
export function VersionList({
  target,
  versions,
  onSelect,
}: {
  target: "routine" | "plan";
  versions: VersionMeta[];
  onSelect: (version: number) => void;
}) {
  const t = useTranslations("History");
  const date = useVersionDate();
  const at = new Map(versions.map((meta) => [meta.version, meta.at]));

  return (
    <ul className="grid gap-2">
      {versions.map((meta, index) => {
        const source = meta.restoredFrom === null ? undefined : at.get(meta.restoredFrom);
        return (
          <li key={meta.version}>
            <Button
              type="button"
              variant="outline"
              onClick={() => onSelect(meta.version)}
              className="grid h-auto w-full justify-stretch gap-1 p-3 text-left whitespace-normal"
            >
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {date(meta.at)}
                {index === 0 ? <Badge>{t("current")}</Badge> : null}
                {source ? (
                  <Badge variant="outline">{t("restoredFrom", { date: date(source) })}</Badge>
                ) : null}
              </span>
              <span className="text-muted-foreground text-sm font-normal">
                <SummaryText target={target} kind={meta.kind} summary={meta.summary} />
              </span>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
