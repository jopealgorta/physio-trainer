import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ExportMenu } from "@/components/export/export-menu";
import { HistorySheet } from "@/components/history/history-sheet";
import { PageActions } from "@/components/page-actions";
import { PageHeader } from "@/components/page-header";
import { PhaseBar } from "@/components/phases/phase-bar";
import { ShareButton } from "@/components/sharing/share-button";
import { PlanBoard } from "@/components/plans/plan-board";
import { PlanDetailsForm } from "@/components/plans/plan-details-form";
import { PlanTitle } from "@/components/plans/plan-title";
import { StatusBadge } from "@/components/routines/status-badge";
import { FromTemplate } from "@/components/templates/from-template";
import { SaveAsTemplateDialog } from "@/components/templates/save-as-template-dialog";
import { TemplateActions } from "@/components/templates/template-actions";
import { TemplateBadge } from "@/components/templates/template-badge";
import { todayIn } from "@/lib/calendar-date";
import { customerName } from "@/lib/customers";
import { loadPlan } from "@/server/plans/load";

export async function generateMetadata({
  params,
}: PageProps<"/plans/[planId]">): Promise<Metadata> {
  const { planId } = await params;
  const loaded = await loadPlan(planId);
  return { title: loaded?.plan.name };
}

export default async function PlanPage({ params }: PageProps<"/plans/[planId]">) {
  const { planId } = await params;
  const loaded = await loadPlan(planId);
  if (!loaded) notFound();
  const { plan, routines, customers, timeZone } = loaded;
  const t = await getTranslations("Plans.board");

  const owner = plan.customerFirstName
    ? customerName(plan.customerFirstName, plan.customerLastName)
    : null;
  const back = plan.customerId
    ? {
        href: `/customers/${plan.customerId}?tab=plans` as Route,
        label: t("customerBack", { name: owner ?? "" }),
      }
    : { href: "/plans?tab=templates" as Route, label: t("back") };

  // Every control stays mounted (owning its dialog); on a phone the secondary ones are reached
  // through the header's "More actions".
  return (
    <PageActions>
      <div className="grid gap-6">
        <PageHeader
          back={back}
          title={
            <PlanTitle
              planId={plan.id}
              name={plan.name}
              isTemplate={plan.isTemplate}
              badges={
                <>
                  <StatusBadge status={plan.status} />
                  {plan.isTemplate ? <TemplateBadge /> : null}
                </>
              }
            />
          }
          meta={
            plan.sourceTemplate ? (
              <FromTemplate kind="plan" template={plan.sourceTemplate} />
            ) : undefined
          }
          actions={
            <>
              {plan.isTemplate ? (
                <TemplateActions
                  kind="plan"
                  template={{ id: plan.id, name: plan.name }}
                  customers={customers}
                />
              ) : (
                <SaveAsTemplateDialog kind="plan" sourceId={plan.id} defaultName={plan.name} />
              )}
              {/* A restore refreshes the page; the details form takes the restored values. */}
              <HistorySheet kind="plan" id={plan.id} />
              {/* A template (no customer) has nobody to share with or export for. */}
              {plan.customerId ? <ExportMenu target={{ kind: "plans", id: plan.id }} /> : null}
            </>
          }
          primary={
            plan.customerId ? (
              <ShareButton primary target={{ target: "weekly_plan", weeklyPlanId: plan.id }} />
            ) : undefined
          }
        />
        {plan.customerId ? (
          <PhaseBar
            kind="plan"
            id={plan.id}
            status={plan.status}
            phaseLabel={plan.phaseLabel}
            startsOn={plan.startsOn}
            endsOn={plan.endsOn}
            today={todayIn(timeZone)}
          />
        ) : null}
        <PlanDetailsForm
          planId={plan.id}
          initial={{
            notes: plan.notes ?? "",
            caseId: plan.caseId,
            status: plan.status,
          }}
          cases={plan.cases.map(({ id, title }) => ({ id, title }))}
          isTemplate={plan.isTemplate}
        />
        <PlanBoard
          planId={plan.id}
          entries={plan.entries}
          dayNotes={plan.dayNotes}
          routines={routines}
        />
      </div>
    </PageActions>
  );
}
