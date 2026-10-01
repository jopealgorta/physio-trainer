import { useFormatter, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { calendarDateToDate, CALENDAR_DATE_FORMAT } from "@/lib/calendar-date";
import type { ScheduleState } from "@/lib/schedule";

/** A phase window as text: "1 Oct – 31 Oct 2026", "From 1 Oct 2026" or "Until 31 Oct 2026". */
export function PhaseRange({
  startsOn,
  endsOn,
}: {
  startsOn: string | null;
  endsOn: string | null;
}) {
  const t = useTranslations("Phases.range");
  const format = useFormatter();
  if (startsOn !== null && endsOn !== null) {
    return format.dateTimeRange(
      calendarDateToDate(startsOn),
      calendarDateToDate(endsOn),
      CALENDAR_DATE_FORMAT,
    );
  }
  if (startsOn !== null) {
    return t("from", { date: format.dateTime(calendarDateToDate(startsOn), CALENDAR_DATE_FORMAT) });
  }
  if (endsOn !== null) {
    return t("until", { date: format.dateTime(calendarDateToDate(endsOn), CALENDAR_DATE_FORMAT) });
  }
  return null;
}

/**
 * Phase label, date range and where it stands today. `state` comes from `scheduleState` with the
 * physio's today. Renders nothing for an item with no phase information at all.
 */
export function PhaseChips({
  phaseLabel,
  startsOn,
  endsOn,
  state,
}: {
  phaseLabel: string | null;
  startsOn: string | null;
  endsOn: string | null;
  state: ScheduleState;
}) {
  const t = useTranslations("Phases.state");
  const hasWindow = startsOn !== null || endsOn !== null;
  if (phaseLabel === null && !hasWindow) return null;

  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      {phaseLabel !== null ? (
        <Badge variant="secondary" className="max-w-full truncate">
          {phaseLabel}
        </Badge>
      ) : null}
      {hasWindow ? (
        <span className="text-muted-foreground text-xs">
          <PhaseRange startsOn={startsOn} endsOn={endsOn} />
        </span>
      ) : null}
      {state === "ended" ? <Badge variant="outline">{t("ended")}</Badge> : null}
      {state === "upcoming" ? <Badge variant="outline">{t("upcoming")}</Badge> : null}
      {state === "active" ? <Badge>{t("current")}</Badge> : null}
    </span>
  );
}
