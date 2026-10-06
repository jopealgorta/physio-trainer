"use client";

import { useFormatter, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { CALENDAR_DATE_FORMAT, calendarDateToDate } from "@/lib/calendar-date";
import { formatSetWeights } from "@/lib/session-logs";
import type { ActivitySession } from "@/server/activity/queries";

import { useShownAsNew } from "./use-shown-as-new";

/**
 * What the patient logged, session by session, newest first, with the notes on each exercise
 * (spec 21). Comments are plain text. A comment that was new when it first showed stays "New" for
 * the rest of the visit although the server marks it seen straight away (`useShownAsNew`).
 */
export function SessionFeed({ sessions }: { sessions: ActivitySession[] }) {
  const t = useTranslations("Activity.sessions");
  const format = useFormatter();
  const sessionIsNew = useShownAsNew(sessions);
  const exerciseIsNew = useShownAsNew(sessions.flatMap((session) => session.exercises));
  const kg = (value: number) => format.number(value, { maximumFractionDigits: 1 });

  return (
    <section className="grid gap-3" aria-labelledby="activity-sessions-title">
      <h3 id="activity-sessions-title" className="text-base font-semibold">
        {t("title")}
      </h3>
      {sessions.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <ul className="grid gap-3">
          {sessions.map((session) => (
            <li key={session.id} className="bg-card grid gap-2 rounded-lg border p-3">
              <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="text-foreground font-medium">{session.routineName}</span>
                <span>
                  {format.dateTime(calendarDateToDate(session.performedOn), CALENDAR_DATE_FORMAT)}
                </span>
                <Badge variant={session.completed ? "secondary" : "outline"}>
                  {session.completed ? t("done") : t("notDone")}
                </Badge>
                {session.pain !== null ? <span>{t("pain", { value: session.pain })}</span> : null}
                {session.rpe !== null ? <span>{t("rpe", { value: session.rpe })}</span> : null}
                {session.comment !== null && sessionIsNew(session) ? (
                  <Badge>{t("new")}</Badge>
                ) : null}
              </div>
              {session.comment !== null ? (
                <p className="text-sm wrap-anywhere whitespace-pre-line">{session.comment}</p>
              ) : null}
              {session.exercises.length > 0 ? (
                <ul className="grid gap-2 border-t pt-2" aria-label={t("exercises")}>
                  {session.exercises.map((exercise) => {
                    const weight =
                      exercise.setWeightsKg !== null
                        ? formatSetWeights(exercise.setWeightsKg, kg)
                        : exercise.weightKg !== null
                          ? kg(exercise.weightKg)
                          : null;
                    return (
                      <li key={exercise.id} className="grid gap-1">
                        <p className="text-sm font-medium wrap-anywhere">{exercise.exerciseName}</p>
                        <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
                          {weight !== null ? <span>{t("weight", { value: weight })}</span> : null}
                          {exercise.pain !== null ? (
                            <span>{t("pain", { value: exercise.pain })}</span>
                          ) : null}
                          {exercise.rpe !== null ? (
                            <span>{t("rpe", { value: exercise.rpe })}</span>
                          ) : null}
                        </div>
                        {exercise.comment !== null ? (
                          <div className="flex flex-wrap items-start gap-2">
                            <p className="min-w-0 text-sm wrap-anywhere whitespace-pre-line">
                              {exercise.comment}
                            </p>
                            {exerciseIsNew(exercise) ? <Badge>{t("new")}</Badge> : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
