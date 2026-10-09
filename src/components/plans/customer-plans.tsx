import { getTranslations } from "next-intl/server";

import { SectionHeader } from "@/components/section-header";
import { PhaseTimeline } from "@/components/phases/phase-timeline";
import { todayIn } from "@/lib/calendar-date";
import { groupByChain } from "@/lib/phases";
import { DEFAULT_PLAN_FILTERS } from "@/lib/plan-params";
import { withPhysio } from "@/server/auth/session";
import { listPlans } from "@/server/plans/queries";

import { TemplatePickerDialog } from "@/components/templates/template-picker-dialog";

import { NewPlanButton } from "./new-plan-button";
import { PlanList } from "./plan-list";

/** A customer's plans tab: their weekly plans and a way to add one (not for archived customers). */
export async function CustomerPlans({
  customerId,
  customerName,
  cases,
  archived,
  timeZone,
}: {
  customerId: string;
  customerName: string;
  cases: { id: string; title: string }[];
  archived: boolean;
  timeZone: string;
}) {
  const t = await getTranslations("Plans");
  const { plans } = await withPhysio((tx, physioId) =>
    listPlans(tx, physioId, { ...DEFAULT_PLAN_FILTERS, customerId }),
  );
  // Phases that continue one another read as a timeline; everything else stays in the list.
  const chains = groupByChain(plans);
  const timelines = chains.filter((chain) => chain.length > 1);
  const singles = chains.filter((chain) => chain.length === 1).flat();
  const dialog = archived ? null : (
    <>
      <TemplatePickerDialog
        kind="plan"
        customer={{ id: customerId, name: customerName }}
        cases={cases}
      />
      <NewPlanButton customerId={customerId} />
    </>
  );

  return (
    <section className="grid gap-4" aria-labelledby="customer-plans-title">
      <SectionHeader id="customer-plans-title" title={t("customerTab.title")} actions={dialog} />
      {timelines.map((chain) => (
        <PhaseTimeline key={chain[0].id} kind="plan" items={chain} today={todayIn(timeZone)} />
      ))}
      {singles.length > 0 ? (
        <PlanList plans={singles} showCustomer={false} timeZone={timeZone} />
      ) : plans.length > 0 ? null : (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          {t("customerTab.empty", { name: customerName })}
        </p>
      )}
    </section>
  );
}
