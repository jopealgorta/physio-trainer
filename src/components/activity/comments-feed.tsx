"use client";

import { useFormatter, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { CALENDAR_DATE_FORMAT, calendarDateToDate } from "@/lib/calendar-date";
import type { ActivityComment } from "@/server/activity/queries";

import { useShownAsNew } from "./use-shown-as-new";

/**
 * What the patient wrote, newest first. Comments are plain text everywhere (spec 13).
 *
 * A comment flagged new stays "New" for the rest of the visit: `MarkCommentsSeen` revalidates,
 * so the server re-renders this tab with those comments already seen, and without this memory
 * the badges would vanish a moment after they appeared. A fresh visit (remount) starts over.
 */
export function CommentsFeed({ comments }: { comments: ActivityComment[] }) {
  const t = useTranslations("Activity.comments");
  const format = useFormatter();
  const isNew = useShownAsNew(comments);

  return (
    <section className="grid gap-3" aria-labelledby="activity-comments-title">
      <h3 id="activity-comments-title" className="text-base font-semibold">
        {t("title")}
      </h3>
      {comments.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <ul className="grid gap-3">
          {comments.map((item) => (
            <li key={item.id} className="bg-card grid gap-1.5 rounded-lg border p-3">
              <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="text-foreground font-medium">{item.routineName}</span>
                <span>
                  {format.dateTime(calendarDateToDate(item.performedOn), CALENDAR_DATE_FORMAT)}
                </span>
                {item.pain !== null ? <span>{t("painValue", { value: item.pain })}</span> : null}
                {item.rpe !== null ? <span>{t("rpeValue", { value: item.rpe })}</span> : null}
                {isNew(item) ? <Badge>{t("new")}</Badge> : null}
              </div>
              <p className="text-sm wrap-anywhere whitespace-pre-line">{item.comment}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
