import { ArrowLeftIcon } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ExportMenu } from "@/components/export/export-menu";
import { HistorySheet } from "@/components/history/history-sheet";
import { PhaseBar } from "@/components/phases/phase-bar";
import { ShareButton } from "@/components/sharing/share-button";
import { PlanBoard } from "@/components/plans/plan-board";
import { PlanDetailsForm } from "@/components/plans/plan-details-form";
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

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={back.href}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeftIcon aria-hidden className="size-4" />
          {back.label}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {/* A restore refreshes the page; the details form takes the restored values. */}
          <HistorySheet kind="plan" id={plan.id} />
          {/* A template (no customer) has nobody to share with or export for. */}
          {plan.customerId ? (
            <>
              <ExportMenu target={{ kind: "plans", id: plan.id }} />
              <ShareButton target={{ target: "weekly_plan", weeklyPlanId: plan.id }} />
            </>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{plan.name}</h1>
        <StatusBadge status={plan.status} />
        {plan.isTemplate ? <TemplateBadge /> : null}
      </div>
      {plan.isTemplate ? (
        <TemplateActions
          kind="plan"
          template={{ id: plan.id, name: plan.name }}
          customers={customers}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {plan.sourceTemplate ? (
            <FromTemplate kind="plan" template={plan.sourceTemplate} />
          ) : (
            <span />
          )}
          <SaveAsTemplateDialog kind="plan" sourceId={plan.id} defaultName={plan.name} />
        </div>
      )}
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
          name: plan.name,
          notes: plan.notes ?? "",
          caseId: plan.caseId,
          status: plan.status,
        }}
        cases={plan.cases.map(({ id, title }) => ({ id, title }))}
        isTemplate={plan.isTemplate}
      />
      <PlanBoard planId={plan.id} entries={plan.entries} routines={routines} />
    </div>
  );
}
