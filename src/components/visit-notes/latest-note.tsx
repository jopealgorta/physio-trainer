import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";

import { Card, CardContent } from "@/components/ui/card";
import { CALENDAR_DATE_FORMAT, calendarDateToDate } from "@/lib/calendar-date";
import { notesHref, PAGE_SIZE, summarize, type SoapField } from "@/lib/visit-notes";

const EXCERPT_CHARS = 200;

export type LatestNoteView = { visitedOn: string } & Record<SoapField, string | null>;

/** Overview card: the customer's latest visit note (date and assessment excerpt), or an empty hint. */
export function LatestNote({
  customerId,
  note,
}: {
  customerId: string;
  note: LatestNoteView | null;
}) {
  const t = useTranslations("VisitNotes");
  const format = useFormatter();
  const summary = note ? summarize(note, EXCERPT_CHARS) : null;

  return (
    <section aria-labelledby="latest-note" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="latest-note" className="text-base font-semibold">
          {t("latest.heading")}
        </h2>
        {note ? (
          <Link
            href={notesHref(customerId, { caseId: null, limit: PAGE_SIZE })}
            className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
          >
            {t("latest.viewAll")}
          </Link>
        ) : null}
      </div>
      <Card>
        <CardContent className="grid gap-1">
          {note ? (
            <>
              <p className="text-muted-foreground text-xs">
                {t("latest.visitOn", {
                  date: format.dateTime(calendarDateToDate(note.visitedOn), CALENDAR_DATE_FORMAT),
                })}
              </p>
              {summary ? (
                <p className="text-sm wrap-anywhere">
                  <span className="font-medium">{t(`soap.${summary.field}.label`)}: </span>
                  {summary.text}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-muted-foreground text-sm">{t("latest.empty")}</p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
