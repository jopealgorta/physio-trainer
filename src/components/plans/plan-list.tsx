import { CalendarDaysIcon } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";

import { IntentLink } from "@/components/intent-link";
import { StatusBadge } from "@/components/routines/status-badge";
import { LinkPendingHint } from "@/components/navigation-pending";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PhaseChips } from "@/components/phases/phase-chips";
import { todayIn } from "@/lib/calendar-date";
import { customerName } from "@/lib/customers";
import { DEFAULT_PLAN_FILTERS, plansHref } from "@/lib/plan-params";
import { scheduleState } from "@/lib/schedule";
import type { PlanSummary } from "@/server/plans/queries";

import { WeekStrip } from "./week-strip";

function PlanLink({ plan, eager }: { plan: PlanSummary; eager: boolean }) {
  return (
    <IntentLink
      href={`/plans/${plan.id}`}
      eager={eager}
      className="focus-visible:ring-ring/30 block min-w-0 truncate rounded-md font-medium outline-none hover:underline focus-visible:ring-2"
    >
      {plan.name}
    </IntentLink>
  );
}

function PlanChips({ plan, today }: { plan: PlanSummary; today: string }) {
  return (
    <PhaseChips
      phaseLabel={plan.phaseLabel}
      startsOn={plan.startsOn}
      endsOn={plan.endsOn}
      state={scheduleState(plan, today)}
    />
  );
}

/**
 * The physio's weekly plans: a table from `md` up, cards below. `showCustomer` is false on a
 * customer's own page, where every row belongs to the same person.
 */
export function PlanList({
  plans,
  showCustomer,
  timeZone,
}: {
  plans: PlanSummary[];
  showCustomer: boolean;
  /** The physio's time zone, so "Updated" shows their calendar day. */
  timeZone?: string;
}) {
  const t = useTranslations("Plans");
  const format = useFormatter();
  const today = todayIn(timeZone ?? "UTC");
  const updated = (plan: PlanSummary) =>
    format.dateTime(plan.updatedAt, { dateStyle: "medium", timeZone });
  const owner = (plan: PlanSummary) =>
    plan.customerFirstName ? customerName(plan.customerFirstName, plan.customerLastName) : null;
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
            <th scope="col" className="w-48 py-2 pr-3 font-medium">
              {t("list.columns.week")}
            </th>
            <th scope="col" className="w-28 py-2 font-medium">
              {t("list.columns.updated")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {plans.map((plan, index) => (
            <tr key={plan.id}>
              <td className="min-w-0 py-2 pr-3">
                <PlanLink plan={plan} eager={index === 0} />
                <PlanChips plan={plan} today={today} />
              </td>
              {showCustomer ? (
                <td className="min-w-0 truncate py-2 pr-3">{owner(plan) ?? dash}</td>
              ) : null}
              <td className="min-w-0 truncate py-2 pr-3">{plan.caseTitle ?? dash}</td>
              <td className="py-2 pr-3">
                <StatusBadge status={plan.status} />
              </td>
              <td className="py-2 pr-3">
                <WeekStrip sessionsPerDay={plan.sessionsPerDay} />
              </td>
              <td className="text-muted-foreground py-2">{updated(plan)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="grid gap-3 md:hidden">
        {plans.map((plan, index) => (
          <li key={plan.id} className="grid min-w-0 gap-2 rounded-lg border p-3">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <PlanLink plan={plan} eager={index === 0} />
              <StatusBadge status={plan.status} />
            </div>
            <PlanChips plan={plan} today={today} />
            {showCustomer && owner(plan) ? <p className="text-sm">{owner(plan)}</p> : null}
            {plan.caseTitle ? (
              <p className="text-muted-foreground text-sm">{plan.caseTitle}</p>
            ) : null}
            <WeekStrip sessionsPerDay={plan.sessionsPerDay} />
            <p className="text-muted-foreground text-xs">{updated(plan)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The physio has no plans at all: plans are created from a customer. */
export function EmptyPlans() {
  const t = useTranslations("Plans.list.empty");
  return (
    <Card>
      <CardContent className="mx-auto grid max-w-md justify-items-center gap-3 py-10 text-center">
        <CalendarDaysIcon aria-hidden className="text-primary size-8" />
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p className="text-muted-foreground text-sm">{t("body")}</p>
        <Button asChild>
          <Link href="/customers">{t("cta")}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/** Filters matched nothing; "Clear filters" only appears when there is a filter to clear. */
export function NoPlanResults({ canClear }: { canClear: boolean }) {
  const t = useTranslations("Plans.list");
  return (
    <Card>
      <CardContent className="mx-auto grid max-w-md justify-items-center gap-3 py-10 text-center">
        <p className="text-muted-foreground text-sm">{t("noResults")}</p>
        {canClear ? (
          <Button asChild variant="outline">
            <Link href={plansHref(DEFAULT_PLAN_FILTERS)} className="relative">
              {t("clearFilters")}
              <LinkPendingHint className="inset-x-3 bottom-1" />
            </Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
