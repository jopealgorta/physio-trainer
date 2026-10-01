import { getFormatter, getTranslations } from "next-intl/server";

import type { Locale } from "@/i18n/config";
import { CALENDAR_DATE_FORMAT, calendarDateToDate } from "@/lib/calendar-date";
import { weekdayName, type Weekday } from "@/lib/plans";
import type { PatientView } from "@/server/patient/view";

import { DayStrip } from "./day-strip";
import { RoutineView } from "./routine-view";

/** The patient page body: greeting, plans for the chosen day with the week strip, and routines. */
export async function PatientHome({
  view,
  firstName,
  locale,
  path,
}: {
  view: PatientView;
  firstName: string;
  locale: Locale;
  /** Canonical link path (for the day links). */
  path: string;
}) {
  const [t, format] = await Promise.all([
    getTranslations({ locale, namespace: "Patient" }),
    getFormatter({ locale }),
  ]);
  const isToday = view.weekday === view.todayWeekday;
  const dayName = weekdayName(locale, view.weekday as Weekday);
  const nothing = view.plans.length === 0 && view.routines.length === 0;
  // A lone routine needs no "Your routines" heading; its own name is the next level down.
  const routinesHeading = view.plans.length > 0 || view.routines.length > 1;

  return (
    <div className="grid gap-8">
      <h1 className="text-2xl font-semibold tracking-tight wrap-anywhere">
        {t("greeting", { name: firstName })}
      </h1>

      {nothing ? (
        <section className="bg-muted grid gap-1 rounded-xl p-4" aria-labelledby="nothing-title">
          <h2 id="nothing-title" className="font-semibold">
            {t("empty.title")}
          </h2>
          <p className="text-muted-foreground text-sm">{t("empty.description")}</p>
          {view.nextStart ? (
            <p className="text-sm font-medium">
              {t("empty.next", {
                date: format.dateTime(calendarDateToDate(view.nextStart), {
                  ...CALENDAR_DATE_FORMAT,
                  dateStyle: undefined,
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                }),
              })}
            </p>
          ) : null}
        </section>
      ) : null}

      {view.plans.length > 0 ? (
        <section className="grid gap-4" aria-labelledby="day-title">
          <h2 id="day-title" className="text-xl font-semibold tracking-tight">
            {isToday ? t("today") : dayName}
          </h2>
          <DayStrip
            path={path}
            locale={locale}
            selected={view.weekday}
            today={view.todayWeekday}
            withContent={view.weekdaysWithContent}
          />
          {view.plans.map((plan) => (
            <div key={plan.id} className="grid gap-4">
              {view.plans.length > 1 || plan.entries.length === 0 ? (
                <h3 className="text-muted-foreground text-sm font-medium wrap-anywhere">
                  {plan.name}
                </h3>
              ) : null}
              {plan.entries.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("restDay", { day: dayName })}</p>
              ) : (
                plan.entries.map((entry) => (
                  <RoutineView
                    key={entry.id}
                    routine={entry.routine}
                    label={entry.label}
                    locale={locale}
                  />
                ))
              )}
              {plan.notes ? (
                <p className="text-muted-foreground text-sm wrap-anywhere whitespace-pre-line">
                  {plan.notes}
                </p>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      {view.routines.length > 0 ? (
        <section className="grid gap-4" aria-labelledby="routines-title">
          {routinesHeading ? (
            <h2 id="routines-title" className="text-xl font-semibold tracking-tight">
              {t("yourRoutines")}
            </h2>
          ) : null}
          {view.routines.map((routine) => (
            <RoutineView
              key={routine.id}
              routine={routine}
              locale={locale}
              headingLevel={routinesHeading ? 3 : 2}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}
