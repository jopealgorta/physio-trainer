import { useLocale, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { WEEKDAYS, weekdayName } from "@/lib/plans";

/**
 * Seven small cells, Monday first: filled when the day has routines. The text alternative lists
 * every day ("Monday: 2 routines, Tuesday: rest, …").
 */
export function WeekStrip({ sessionsPerDay }: { sessionsPerDay: number[] }) {
  const t = useTranslations("Plans.list");
  const locale = useLocale();
  const summary = WEEKDAYS.map((weekday) =>
    t("weekDay", { day: weekdayName(locale, weekday), count: sessionsPerDay[weekday - 1] ?? 0 }),
  ).join(", ");

  return (
    <div role="img" aria-label={`${t("weekLabel")}: ${summary}`} className="flex gap-1">
      {WEEKDAYS.map((weekday) => {
        const count = sessionsPerDay[weekday - 1] ?? 0;
        return (
          <span
            key={weekday}
            aria-hidden
            title={t("weekDay", { day: weekdayName(locale, weekday), count })}
            className={cn(
              "flex size-5 items-center justify-center rounded-sm text-[10px] leading-none font-medium uppercase",
              count > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {weekdayName(locale, weekday, "short").slice(0, 1)}
          </span>
        );
      })}
    </div>
  );
}
