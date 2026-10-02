import { useFormatter, useTranslations } from "next-intl";

import { CALENDAR_DATE_FORMAT, calendarDateToDate } from "@/lib/calendar-date";
import type { CustomerActivity } from "@/server/activity/queries";

/** Three headline numbers above the Activity tab's charts. */
export function ActivitySummary({ summary }: { summary: CustomerActivity["summary"] }) {
  const t = useTranslations("Activity.summary");
  const format = useFormatter();
  const { adherence, completed, lastLoggedOn } = summary;

  const tiles = [
    { label: t("sessions"), value: format.number(completed), hint: t("sessionsHint") },
    {
      label: t("adherence"),
      value:
        adherence.ratio === null
          ? t("adherenceNone")
          : format.number(adherence.ratio, { style: "percent" }),
      hint: t("adherenceHint"),
    },
    {
      label: t("lastLogged"),
      value: lastLoggedOn
        ? format.dateTime(calendarDateToDate(lastLoggedOn), CALENDAR_DATE_FORMAT)
        : t("never"),
      hint: null,
    },
  ];

  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      {tiles.map((tile) => (
        <div key={tile.label} className="bg-card grid gap-1 rounded-lg border p-3">
          <dt className="text-muted-foreground text-xs">{tile.label}</dt>
          <dd className="text-xl font-semibold tracking-tight tabular-nums">{tile.value}</dd>
          {tile.hint ? <dd className="text-muted-foreground text-xs">{tile.hint}</dd> : null}
        </div>
      ))}
    </dl>
  );
}
