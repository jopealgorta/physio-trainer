"use client";

import { useTranslations } from "next-intl";

import type { ItemDiff, RoutineDiff } from "@/lib/history/diff";

import { HeaderChanges, useChangeText } from "./field-change";
import { Marker } from "./marker";

/** What changed between two routine versions: header fields, then each exercise that changed. */
export function RoutineDiffView({ diff }: { diff: RoutineDiff }) {
  const t = useTranslations("History");
  const items = diff.items.filter((item) => item.status !== "unchanged" || item.moved);
  if (diff.header.length === 0 && items.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("noChanges")}</p>;
  }
  return (
    <div className="grid gap-4">
      <HeaderChanges changes={diff.header} />
      {items.length > 0 ? (
        <ul className="grid gap-3">
          {items.map((item, index) => (
            <ItemChange key={index} item={item} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ItemChange({ item }: { item: ItemDiff }) {
  const t = useTranslations("History");
  const changeText = useChangeText();
  const name = (item.after ?? item.before)?.exercise.name ?? "";

  if (item.status === "added" || item.status === "removed") {
    return (
      <li className="text-sm">
        <Marker kind={item.status}>{name}</Marker>
      </li>
    );
  }

  const set = (index: number) => t("set", { number: index + 1 });
  return (
    <li className="grid gap-1 text-sm">
      <p className="flex flex-wrap items-center gap-2 font-medium">
        <span>{name}</span>
        {item.moved ? (
          <span className="text-muted-foreground text-xs font-normal">{t("moved")}</span>
        ) : null}
      </p>
      <ul className="text-muted-foreground grid gap-0.5 ps-3">
        {/* The set count shows as the added/removed set rows below. */}
        {item.changes
          .filter((change) => change.field !== "sets")
          .map((change) => (
            <li key={change.field} className="break-words">
              {changeText(change)}
            </li>
          ))}
        {item.sets.flatMap((diff) =>
          diff.kind === "changed" ? (
            diff.changes.map((change) => (
              <li key={`${diff.index}-${change.field}`}>
                {set(diff.index)}
                {t("separator")}
                {changeText(change)}
              </li>
            ))
          ) : (
            <li key={diff.index}>
              <Marker kind={diff.kind}>{set(diff.index)}</Marker>
            </li>
          ),
        )}
      </ul>
    </li>
  );
}
