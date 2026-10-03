import { DownloadIcon } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import { CALENDAR_DATE_FORMAT, calendarDateToDate } from "@/lib/calendar-date";
import { buildWorkoutPath } from "@/lib/patient-paths";
import { addDays } from "@/lib/phases";
import { weekdayName, type Weekday } from "@/lib/plans";
import { dateForWeekday, isLoggableDate, loggedWeekdays } from "@/lib/session-logs";
import type { PatientExerciseLog } from "@/server/patient/log-exercise";
import type { PatientLog } from "@/server/patient/log-session";
import type { PatientView } from "@/server/patient/view";

import { DayStrip } from "./day-strip";
import type { ExerciseLogging } from "./exercise-list";
import { LogSessionButton } from "./log-session-button";
import type { LoggableDay } from "./log-sheet";
import { RoutineView } from "./routine-view";

/** The patient page body: greeting, plans for the chosen day with the week strip, and routines. */
export async function PatientHome({
  view,
  firstName,
  locale,
  path,
  logging,
}: {
  view: PatientView;
  firstName: string;
  locale: Locale;
  /** Canonical link path (for the day links). */
  path: string;
  /**
   * Session logging (spec 13) and exercise logs (spec 19): this week's logs, and whether this
   * visitor may write one.
   */
  logging: {
    code: string;
    logs: PatientLog[];
    exerciseLogs: PatientExerciseLog[];
    canLog: boolean;
  };
}) {
  const [t, tE, format] = await Promise.all([
    getTranslations({ locale, namespace: "Patient" }),
    getTranslations({ locale, namespace: "Export.patient" }),
    getFormatter({ locale }),
  ]);
  const isToday = view.weekday === view.todayWeekday;
  const dayName = weekdayName(locale, view.weekday as Weekday);
  const nothing = view.plans.length === 0 && view.routines.length === 0;
  // A lone routine needs no "Your routines" heading; its own name is the next level down.
  const routinesHeading = view.plans.length > 0 || view.routines.length > 1;

  // A plan day stands for one date of this week; single routines are done on any day, so the
  // patient picks today or yesterday in the sheet.
  const day = (date: string): LoggableDay => ({
    date,
    relative: date === view.today ? "today" : "yesterday",
  });
  const dayDate = dateForWeekday(view.today, view.weekday);
  const planDays = logging.canLog && isLoggableDate(dayDate, view.today) ? [day(dayDate)] : [];
  const singleDays = logging.canLog ? [day(addDays(view.today, -1)), day(view.today)] : [];
  const logSlot = (
    routine: { id: string; name: string },
    entryId: string | null,
    days: LoggableDay[],
    shownDate: string,
  ) => (
    <LogSessionButton
      code={logging.code}
      routineId={routine.id}
      entryId={entryId}
      routineName={routine.name}
      days={days}
      logs={logging.logs.filter(
        (entry) => entry.routineId === routine.id && entry.entryId === entryId,
      )}
      shownDate={shownDate}
    />
  );
  // The same days and shown date as the routine's log slot, for each of its exercises.
  const exerciseLogging = (
    routineId: string,
    entryId: string | null,
    days: LoggableDay[],
    shownDate: string,
  ): ExerciseLogging => ({
    code: logging.code,
    routineId,
    entryId,
    days,
    shownDate,
    logs: logging.exerciseLogs.filter(
      (entry) => entry.routineId === routineId && entry.entryId === entryId,
    ),
  });

  return (
    <div className="grid gap-8">
      <div className="grid justify-items-start gap-3">
        <h1 className="text-2xl font-semibold tracking-tight wrap-anywhere">
          {t("greeting", { name: firstName })}
        </h1>
        {nothing ? null : (
          <Button asChild variant="outline" size="sm">
            {/* No `download` attribute: the response is an attachment anyway, and when the link was
                locked or revoked since the page loaded the browser must follow the redirect to the
                PIN gate or Unavailable page instead of saving that HTML as a file. */}
            <a href={`${path}/download`}>
              <DownloadIcon aria-hidden />
              {tE("download")}
            </a>
          </Button>
        )}
      </div>

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
            logged={loggedWeekdays(view.today, logging.logs)}
          />
          {view.plans.map((plan) => (
            <div key={plan.id} className="grid gap-4">
              {view.plans.length > 1 || plan.entries.length === 0 ? (
                <h3 className="text-muted-foreground text-sm font-medium wrap-anywhere">
                  {plan.name}
                </h3>
              ) : null}
              {plan.dayNotes ? (
                <p className="bg-muted rounded-lg p-3 text-sm wrap-anywhere whitespace-pre-line">
                  <span className="sr-only">{t("dayNote")}: </span>
                  {plan.dayNotes}
                </p>
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
                    startHref={buildWorkoutPath(path, entry.routine.id, entry.id)}
                    logSlot={logSlot(entry.routine, entry.id, planDays, dayDate)}
                    exerciseLogging={exerciseLogging(entry.routine.id, entry.id, planDays, dayDate)}
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
              startHref={buildWorkoutPath(path, routine.id)}
              logSlot={logSlot(routine, null, singleDays, view.today)}
              exerciseLogging={exerciseLogging(routine.id, null, singleDays, view.today)}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}
