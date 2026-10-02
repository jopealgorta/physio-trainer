"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId } from "react";

import type { EntryDiff, PlanDiff } from "@/lib/history/diff";
import { WEEKDAYS, weekdayName } from "@/lib/plans";

import { HeaderChanges, useChangeText } from "./field-change";
import { Marker } from "./marker";

/** What changed between two plan versions: header fields, then the changed entries by weekday. */
export function PlanDiffView({ diff }: { diff: PlanDiff }) {
  const t = useTranslations("History");
  const locale = useLocale();
  const entries = diff.entries.filter((entry) => entry.status !== "unchanged" || entry.moved);
  if (diff.header.length === 0 && entries.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("noChanges")}</p>;
  }
  // An entry shows on the day it is on now (a removed one, on the day it was on).
  const weekdayOf = (entry: EntryDiff) => (entry.after ?? entry.before)?.weekday;
  return (
    <div className="grid gap-4">
      <HeaderChanges changes={diff.header} />
      {WEEKDAYS.map((weekday) => {
        const day = entries.filter((entry) => weekdayOf(entry) === weekday);
        return day.length > 0 ? (
          <Day key={weekday} name={weekdayName(locale, weekday)} entries={day} />
        ) : null;
      })}
    </div>
  );
}

function Day({ name, entries }: { name: string; entries: EntryDiff[] }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="grid gap-2">
      <h3 id={id} className="text-sm font-semibold">
        {name}
      </h3>
      <ul className="grid gap-2">
        {entries.map((entry) => (
          <EntryChange key={(entry.after ?? entry.before)?.id} entry={entry} />
        ))}
      </ul>
    </div>
  );
}

function EntryChange({ entry }: { entry: EntryDiff }) {
  const t = useTranslations("History");
  const changeText = useChangeText();
  const current = entry.after ?? entry.before;
  const name = current?.routine.name ?? "";

  if (entry.status === "added" || entry.status === "removed") {
    return (
      <li className="text-sm">
        <Marker kind={entry.status}>{name}</Marker>
      </li>
    );
  }
  return (
    <li className="grid gap-1 text-sm">
      <p className="flex flex-wrap items-center gap-2 font-medium">
        <span>{name}</span>
        {entry.moved ? (
          <span className="text-muted-foreground text-xs font-normal">{t("moved")}</span>
        ) : null}
      </p>
      {entry.changes.length > 0 ? (
        <ul className="text-muted-foreground grid gap-0.5 ps-3">
          {entry.changes.map((change) => (
            <li key={change.field} className="break-words">
              {/* The diff pairs routines by id; show them by name. */}
              {change.field === "routine"
                ? changeText({
                    field: "routine",
                    from: entry.before?.routine.name,
                    to: entry.after?.routine.name,
                  })
                : changeText(change)}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
