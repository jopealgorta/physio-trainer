"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { CALENDAR_DATE_FORMAT, calendarDateToDate } from "@/lib/calendar-date";
import type { ActivityComment } from "@/server/activity/queries";

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
  const [shownAsNew, setShownAsNew] = useState<ReadonlySet<string>>(() => unseenIds(comments));
  const arrived = [...unseenIds(comments)].filter((id) => !shownAsNew.has(id));
  // Adjusting state while rendering (React's pattern for state derived from props).
  if (arrived.length > 0) setShownAsNew(new Set([...shownAsNew, ...arrived]));

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
                {!item.seen || shownAsNew.has(item.id) ? <Badge>{t("new")}</Badge> : null}
              </div>
              <p className="text-sm wrap-anywhere whitespace-pre-line">{item.comment}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function unseenIds(comments: ActivityComment[]): Set<string> {
  return new Set(comments.filter((item) => !item.seen).map((item) => item.id));
}
