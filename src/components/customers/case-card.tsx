import { useFormatter, useTranslations } from "next-intl";

import { BodyAreaBadge } from "@/components/body-areas/body-area-badge";
import { Badge } from "@/components/ui/badge";
import type { Case } from "@/db/schema";
import { CALENDAR_DATE_FORMAT, calendarDateToDate } from "@/lib/calendar-date";

import { CaseActions } from "./case-actions";
import { CaseSheet } from "./case-sheet";

function Detail({
  label,
  children,
  multiline = false,
}: {
  label: string;
  children: React.ReactNode;
  multiline?: boolean;
}) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={multiline ? "text-sm break-words whitespace-pre-line" : "text-sm break-words"}>
        {children}
      </dd>
    </div>
  );
}

/**
 * Summary of one case with its Edit and Close/Reopen actions. Precautions are surfaced in the
 * overview's alert instead. `today` is the physio's calendar day (`YYYY-MM-DD`).
 */
export function CaseCard({
  case: item,
  customerName,
  today,
}: {
  case: Case;
  customerName: string;
  today: string;
}) {
  const t = useTranslations("Cases");
  const format = useFormatter();
  const date = (value: string) => format.dateTime(calendarDateToDate(value), CALENDAR_DATE_FORMAT);
  const closed = item.status === "closed";

  return (
    <article className="grid gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 text-base font-semibold break-words">{item.title}</h3>
        <Badge variant={closed ? "outline" : "secondary"}>{t(`status.${item.status}`)}</Badge>
        {item.bodyArea ? <BodyAreaBadge area={item.bodyArea} side={item.side} /> : null}
      </div>
      <p className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <span>{t("openedOnDate", { date: date(item.openedOn) })}</span>
        {closed && item.closedOn ? (
          <span>{t("closedOn", { date: date(item.closedOn) })}</span>
        ) : null}
        {item.initialPain !== null ? (
          <span>{t("painValue", { value: item.initialPain })}</span>
        ) : null}
      </p>
      <dl className="grid gap-3 sm:grid-cols-2">
        {item.diagnosis ? <Detail label={t("diagnosis")}>{item.diagnosis}</Detail> : null}
        {item.goals ? (
          <Detail label={t("goals")} multiline>
            {item.goals}
          </Detail>
        ) : null}
        {item.injuryOn ? <Detail label={t("injuryOn")}>{date(item.injuryOn)}</Detail> : null}
        {item.surgeryOn ? <Detail label={t("surgeryOn")}>{date(item.surgeryOn)}</Detail> : null}
        {item.notes ? (
          <Detail label={t("notes")} multiline>
            {item.notes}
          </Detail>
        ) : null}
      </dl>
      <CaseActions caseId={item.id} status={item.status} today={today}>
        <CaseSheet
          customerId={item.customerId}
          customerName={customerName}
          case={{
            id: item.id,
            title: item.title,
            diagnosis: item.diagnosis,
            bodyArea: item.bodyArea,
            side: item.side,
            injuryOn: item.injuryOn,
            surgeryOn: item.surgeryOn,
            precautions: item.precautions,
            goals: item.goals,
            initialPain: item.initialPain,
            notes: item.notes,
            openedOn: item.openedOn,
          }}
        />
      </CaseActions>
    </article>
  );
}
