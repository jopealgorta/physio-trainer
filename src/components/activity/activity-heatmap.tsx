import { useFormatter, useTranslations } from "next-intl";

import type { DayCell, DayState } from "@/lib/adherence";
import { CALENDAR_DATE_FORMAT, calendarDateToDate } from "@/lib/calendar-date";
import { WEEKDAYS } from "@/lib/plans";
import { cn } from "@/lib/utils";

/**
 * How each state looks, on tokens only. Colour is never the only signal: every square also has
 * its own accessible name, and the legend names the colours.
 */
const LOOK: Record<DayState, string> = {
  done: "bg-primary",
  partial: "bg-primary/45",
  extra: "bg-primary/20 ring-1 ring-primary/40 ring-inset",
  missed: "bg-destructive/20 ring-1 ring-destructive/60 ring-inset",
  planned: "bg-background ring-2 ring-primary ring-inset",
  upcoming: "bg-background border border-dashed border-foreground/40",
  none: "bg-muted",
};

const LEGEND = ["done", "partial", "missed", "extra", "upcoming", "none"] as const;

const swatch = "block size-5 rounded-[5px] sm:size-6";

/**
 * 12-week calendar (spec 13): a column per week, Monday at the top, one square per day showing
 * how much of what was planned the patient logged.
 */
export function ActivityHeatmap({ weeks, cells }: { weeks: string[][]; cells: DayCell[] }) {
  const t = useTranslations("Activity.heatmap");
  const format = useFormatter();
  const date = (
    value: string,
    options: { dateStyle?: undefined; month?: "short"; weekday?: "short" },
  ) => format.dateTime(calendarDateToDate(value), { ...CALENDAR_DATE_FORMAT, ...options });
  const monthOf = (week: string[]) => week[0]!.slice(0, 7);

  return (
    <section className="grid gap-3" aria-labelledby="activity-heatmap-title">
      <h3 id="activity-heatmap-title" className="text-base font-semibold">
        {t("title")}
      </h3>
      <div className="overflow-x-auto pb-1">
        <div className="grid w-max grid-cols-[auto_1fr] gap-x-2 gap-y-1">
          <span aria-hidden />
          <div aria-hidden className="text-muted-foreground flex gap-1 text-xs">
            {weeks.map((week, index) => (
              <span key={week[0]} className="w-5 overflow-visible whitespace-nowrap sm:w-6">
                {index === 0 || monthOf(week) !== monthOf(weeks[index - 1]!)
                  ? date(week[0]!, { dateStyle: undefined, month: "short" })
                  : null}
              </span>
            ))}
          </div>
          <div
            aria-hidden
            className="text-muted-foreground grid grid-rows-7 gap-1 text-right text-xs"
          >
            {WEEKDAYS.map((weekday) => (
              <span key={weekday} className="flex h-5 items-center justify-end sm:h-6">
                {weekday % 2 === 1
                  ? date(weeks[0]![weekday - 1]!, { dateStyle: undefined, weekday: "short" })
                  : null}
              </span>
            ))}
          </div>
          <ul aria-label={t("label")} className="grid grid-flow-col grid-rows-7 gap-1">
            {cells.map((cell) => (
              <li
                key={cell.date}
                data-state={cell.state}
                aria-label={t(`state.${cell.state}`, {
                  date: date(cell.date, {}),
                  planned: cell.planned,
                  completed: cell.completed,
                })}
                className={cn(swatch, LOOK[cell.state])}
              />
            ))}
          </ul>
        </div>
      </div>
      <ul
        aria-label={t("legend.label")}
        className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-2 text-xs"
      >
        {LEGEND.map((state) => (
          <li key={state} className="flex items-center gap-1.5">
            <span aria-hidden className={cn("size-4 rounded-[4px]", LOOK[state])} />
            {t(`legend.${state}`)}
          </li>
        ))}
      </ul>
    </section>
  );
}
