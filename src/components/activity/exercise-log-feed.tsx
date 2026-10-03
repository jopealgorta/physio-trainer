"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { CALENDAR_DATE_FORMAT, calendarDateToDate } from "@/lib/calendar-date";
import type { ActivityExerciseLog } from "@/server/activity/queries";

/**
 * What the patient noted on single exercises (spec 19), newest first, grouped by day and routine.
 * Comments are plain text. Like `CommentsFeed`, a comment that was new when it first showed stays
 * "New" for the rest of the visit, although the server marks it seen straight away.
 */
export function ExerciseLogFeed({ logs }: { logs: ActivityExerciseLog[] }) {
  const t = useTranslations("Activity.exercises");
  const format = useFormatter();
  const [shownAsNew, setShownAsNew] = useState<ReadonlySet<string>>(() => unseenIds(logs));
  const arrived = [...unseenIds(logs)].filter((id) => !shownAsNew.has(id));
  // Adjusting state while rendering (React's pattern for state derived from props).
  if (arrived.length > 0) setShownAsNew(new Set([...shownAsNew, ...arrived]));

  // `logs` arrive newest first, so a group's rows are contiguous.
  const groups: { key: string; performedOn: string; routineName: string; rows: typeof logs }[] = [];
  for (const log of logs) {
    const key = `${log.performedOn}|${log.routineName}`;
    const last = groups.at(-1);
    if (last?.key === key) last.rows.push(log);
    else
      groups.push({ key, performedOn: log.performedOn, routineName: log.routineName, rows: [log] });
  }

  return (
    <section className="grid gap-3" aria-labelledby="activity-exercises-title">
      <div className="grid gap-1">
        <h2 id="activity-exercises-title" className="text-base font-semibold">
          {t("title")}
        </h2>
        <p className="text-muted-foreground text-sm">{t("description")}</p>
      </div>
      {groups.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        groups.map((group) => (
          <div key={group.key} className="grid gap-2">
            <h3 className="text-sm font-medium">
              {t("group", {
                date: format.dateTime(calendarDateToDate(group.performedOn), CALENDAR_DATE_FORMAT),
                routine: group.routineName,
              })}
            </h3>
            <ul className="grid gap-2">
              {group.rows.map((log) => {
                const values = [
                  log.pain !== null ? t("pain", { value: log.pain }) : null,
                  log.rpe !== null ? t("rpe", { value: log.rpe }) : null,
                  log.weightKg !== null
                    ? t("weight", {
                        value: format.number(log.weightKg, { maximumFractionDigits: 1 }),
                      })
                    : null,
                ].filter((value) => value !== null);
                return (
                  <li key={log.id} className="bg-card grid gap-1 rounded-lg border p-3">
                    <p className="text-sm font-medium wrap-anywhere">{log.exerciseName}</p>
                    {values.length > 0 ? (
                      <p className="text-muted-foreground text-xs">{values.join(" · ")}</p>
                    ) : null}
                    {log.comment !== null ? (
                      <div className="flex flex-wrap items-start gap-2">
                        <p className="min-w-0 text-sm wrap-anywhere whitespace-pre-line">
                          {log.comment}
                        </p>
                        {!log.seen || shownAsNew.has(log.id) ? <Badge>{t("new")}</Badge> : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

function unseenIds(logs: ActivityExerciseLog[]): Set<string> {
  return new Set(logs.filter((log) => !log.seen).map((log) => log.id));
}
