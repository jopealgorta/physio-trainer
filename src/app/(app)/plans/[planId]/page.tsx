import { ArrowLeftIcon } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PlanBoard } from "@/components/plans/plan-board";
import { PlanDetailsForm } from "@/components/plans/plan-details-form";
import { StatusBadge } from "@/components/routines/status-badge";
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
  const { plan, routines } = loaded;
  const t = await getTranslations("Plans.board");

  const owner = plan.customerFirstName
    ? customerName(plan.customerFirstName, plan.customerLastName)
    : null;
  const back = plan.customerId
    ? {
        href: `/customers/${plan.customerId}?tab=plans` as Route,
        label: t("customerBack", { name: owner ?? "" }),
      }
    : { href: "/plans" as Route, label: t("back") };

  return (
    <div className="grid gap-6">
      <Link
        href={back.href}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon aria-hidden className="size-4" />
        {back.label}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{plan.name}</h1>
        <StatusBadge status={plan.status} />
      </div>
      <PlanDetailsForm
        // A newer version means the plan changed elsewhere: start the form from the server's copy.
        key={plan.version}
        planId={plan.id}
        initial={{
          name: plan.name,
          notes: plan.notes ?? "",
          caseId: plan.caseId,
          status: plan.status,
        }}
        cases={plan.cases.map(({ id, title }) => ({ id, title }))}
      />
      <PlanBoard
        planId={plan.id}
        entries={plan.entries}
        routines={routines}
        canAdd={plan.customerId !== null}
      />
    </div>
  );
}
