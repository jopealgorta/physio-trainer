import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { DumbbellIcon } from "lucide-react";

import { IntentLink } from "@/components/intent-link";
import { LinkPendingHint } from "@/components/navigation-pending";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PhaseChips } from "@/components/phases/phase-chips";
import { todayIn } from "@/lib/calendar-date";
import { customerName } from "@/lib/customers";
import { DEFAULT_ROUTINE_FILTERS, routinesHref } from "@/lib/routine-params";
import { scheduleState } from "@/lib/schedule";
import type { RoutineSummary } from "@/server/routines/queries";

import { NewRoutinePicker } from "./new-routine-picker";
import { StatusBadge } from "./status-badge";

function RoutineLink({ routine, eager }: { routine: RoutineSummary; eager: boolean }) {
  return (
    <IntentLink
      href={`/routines/${routine.id}`}
      eager={eager}
      className="focus-visible:ring-ring/30 block min-w-0 truncate rounded-md font-medium outline-none hover:underline focus-visible:ring-2"
    >
      {routine.name}
    </IntentLink>
  );
}

/** Phase label, dates and state of a standalone routine (plan-owned ones follow their plan). */
function RoutineChips({ routine, today }: { routine: RoutineSummary; today: string }) {
  if (!routine.isStandalone) return null;
  return (
    <PhaseChips
      phaseLabel={routine.phaseLabel}
      startsOn={routine.startsOn}
      endsOn={routine.endsOn}
      state={scheduleState(routine, today)}
    />
  );
}

/**
 * The physio's routines: a table from `md` up, cards below. `showCustomer` is false on a
 * customer's own page, where every row belongs to the same person.
 */
export function RoutineList({
  routines,
  showCustomer,
  timeZone,
}: {
  routines: RoutineSummary[];
  showCustomer: boolean;
  /** The physio's time zone, so "Updated" shows their calendar day. */
  timeZone?: string;
}) {
  const t = useTranslations("Routines");
  const format = useFormatter();
  const today = todayIn(timeZone ?? "UTC");
  const updated = (routine: RoutineSummary) =>
    format.dateTime(routine.updatedAt, { dateStyle: "medium", timeZone });
  const items = (routine: RoutineSummary) => t("list.items", { count: routine.itemCount });
  const perWeek = (routine: RoutineSummary) =>
    routine.sessionsPerWeek === null ? null : t("list.perWeek", { count: routine.sessionsPerWeek });
  const owner = (routine: RoutineSummary) =>
    routine.customerFirstName
      ? customerName(routine.customerFirstName, routine.customerLastName)
      : null;
  const dash = <span className="text-muted-foreground">—</span>;

  return (
    <div className="grid gap-3">
      <table aria-label={t("title")} className="hidden w-full table-fixed text-sm md:table">
        <thead>
          <tr className="text-muted-foreground border-b text-left text-xs">
            <th scope="col" className="w-1/3 py-2 pr-3 font-medium">
              {t("list.columns.name")}
            </th>
            {showCustomer ? (
              <th scope="col" className="py-2 pr-3 font-medium">
                {t("list.columns.customer")}
              </th>
            ) : null}
            <th scope="col" className="py-2 pr-3 font-medium">
              {t("list.columns.case")}
            </th>
            <th scope="col" className="w-24 py-2 pr-3 font-medium">
              {t("list.columns.status")}
            </th>
            <th scope="col" className="w-28 py-2 pr-3 font-medium">
              {t("list.columns.items")}
            </th>
            <th scope="col" className="w-20 py-2 pr-3 font-medium">
              {t("list.columns.frequency")}
            </th>
            <th scope="col" className="w-28 py-2 font-medium">
              {t("list.columns.updated")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {routines.map((routine, index) => (
            <tr key={routine.id}>
              <td className="min-w-0 py-2 pr-3">
                <RoutineLink routine={routine} eager={index === 0} />
                <RoutineChips routine={routine} today={today} />
              </td>
              {showCustomer ? (
                <td className="min-w-0 truncate py-2 pr-3">{owner(routine)}</td>
              ) : null}
              <td className="min-w-0 truncate py-2 pr-3">{routine.caseTitle ?? dash}</td>
              <td className="py-2 pr-3">
                <StatusBadge status={routine.status} />
              </td>
              <td className="py-2 pr-3">{items(routine)}</td>
              <td className="py-2 pr-3">{perWeek(routine) ?? dash}</td>
              <td className="text-muted-foreground py-2">{updated(routine)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="grid gap-3 md:hidden">
        {routines.map((routine, index) => (
          <li key={routine.id} className="grid min-w-0 gap-2 rounded-lg border p-3">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <RoutineLink routine={routine} eager={index === 0} />
              <StatusBadge status={routine.status} />
            </div>
            <RoutineChips routine={routine} today={today} />
            {showCustomer ? <p className="text-sm">{owner(routine)}</p> : null}
            {routine.caseTitle ? (
              <p className="text-muted-foreground text-sm">{routine.caseTitle}</p>
            ) : null}
            <p className="text-muted-foreground text-xs">
              {[items(routine), perWeek(routine), updated(routine)].filter(Boolean).join(" · ")}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** No routines yet: create one for a customer, or add a customer first when there are none. */
export function EmptyRoutines({ customers }: { customers: { id: string; name: string }[] }) {
  const t = useTranslations("Routines.list.empty");
  return (
    <Card>
      <CardContent className="mx-auto grid max-w-md justify-items-center gap-3 py-10 text-center">
        <DumbbellIcon aria-hidden className="text-primary size-8" />
        <h2 className="text-base font-semibold">{t("title")}</h2>
        {customers.length > 0 ? (
          <>
            <p className="text-muted-foreground text-sm">{t("bodyPick")}</p>
            <NewRoutinePicker customers={customers} />
          </>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">{t("body")}</p>
            <Button asChild>
              <Link href="/customers">{t("cta")}</Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Filters matched nothing; "Clear filters" only appears when there is a filter to clear. */
export function NoRoutineResults({ canClear }: { canClear: boolean }) {
  const t = useTranslations("Routines.list");
  return (
    <Card>
      <CardContent className="mx-auto grid max-w-md justify-items-center gap-3 py-10 text-center">
        <p className="text-muted-foreground text-sm">{t("noResults")}</p>
        {canClear ? (
          <Button asChild variant="outline">
            <Link href={routinesHref(DEFAULT_ROUTINE_FILTERS)} className="relative">
              {t("clearFilters")}
              <LinkPendingHint className="inset-x-3 bottom-1" />
            </Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
