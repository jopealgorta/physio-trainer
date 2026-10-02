import { useFormatter, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { CALENDAR_DATE_FORMAT, calendarDateToDate } from "@/lib/calendar-date";
import type { ActivityComment } from "@/server/activity/queries";

/** What the patient wrote, newest first. Comments are plain text everywhere (spec 13). */
export function CommentsFeed({ comments }: { comments: ActivityComment[] }) {
  const t = useTranslations("Activity.comments");
  const format = useFormatter();

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
                {!item.seen ? <Badge>{t("new")}</Badge> : null}
              </div>
              <p className="text-sm wrap-anywhere whitespace-pre-line">{item.comment}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
