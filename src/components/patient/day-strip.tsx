import { CheckIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import type { Locale } from "@/i18n/config";
import { WEEKDAYS, weekdayName } from "@/lib/plans";
import { cn } from "@/lib/utils";

/**
 * Seven day links, Monday first, so the patient can look at another day of their plan. The
 * selected day is a `?day=` query (no JS needed); today has no query so the link stays clean.
 */
export async function DayStrip({
  path,
  locale,
  selected,
  today,
  withContent,
  logged = [],
}: {
  /** Canonical link path the strip links back to. */
  path: string;
  locale: Locale;
  selected: number;
  today: number;
  withContent: readonly number[];
  /** Weekdays of this week with a completed session logged (spec 13). */
  logged?: readonly number[];
}) {
  const t = await getTranslations({ locale, namespace: "Patient.week" });
  return (
    <nav aria-label={t("label")}>
      <ul className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((weekday) => {
          const day = weekdayName(locale, weekday);
          const isToday = weekday === today;
          const hasContent = withContent.includes(weekday);
          const isLogged = logged.includes(weekday);
          const base = t(
            isToday && hasContent
              ? "dayBoth"
              : isToday
                ? "dayToday"
                : hasContent
                  ? "dayHasRoutines"
                  : "dayPlain",
            { day },
          );
          const label = isLogged ? `${base}, ${t("logged")}` : base;
          return (
            <li key={weekday}>
              <Link
                href={(isToday ? path : `${path}?day=${weekday}`) as Route}
                scroll={false}
                prefetch={false}
                replace
                aria-label={label}
                aria-current={weekday === selected ? "date" : undefined}
                className={cn(
                  "focus-visible:ring-ring/50 flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-xs font-medium outline-none focus-visible:ring-[3px]",
                  weekday === selected
                    ? "bg-primary text-primary-foreground border-transparent"
                    : "bg-background hover:bg-muted",
                  isToday && weekday !== selected && "border-primary border-2",
                )}
              >
                <span aria-hidden>{weekdayName(locale, weekday, "short")}</span>
                {isLogged ? (
                  <CheckIcon aria-hidden className="size-3" strokeWidth={3} />
                ) : (
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 rounded-full",
                      hasContent
                        ? weekday === selected
                          ? "bg-primary-foreground"
                          : "bg-primary"
                        : "bg-transparent",
                    )}
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
