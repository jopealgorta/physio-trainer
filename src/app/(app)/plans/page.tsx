import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { NewForCustomerPicker } from "@/components/new-for-customer-picker";
import { PendingContent, PendingScope } from "@/components/navigation-pending";
import { PageHeader } from "@/components/page-header";
import { EmptyPlans, NoPlanResults, PlanList } from "@/components/plans/plan-list";
import { PlansToolbar } from "@/components/plans/plans-toolbar";
import { ListTabs } from "@/components/templates/list-tabs";
import { NewTemplateButton } from "@/components/templates/new-template-button";
import {
  EmptyTemplates,
  NoTemplateResults,
  TemplateList,
} from "@/components/templates/template-list";
import { customerName } from "@/lib/customers";
import { hasActivePlanFilters, parsePlanParams } from "@/lib/plan-params";
import { withPhysio } from "@/server/auth/session";
import { listCustomers } from "@/server/customers/queries";
import { listPlans } from "@/server/plans/queries";
import { getProfile } from "@/server/physios/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Plans");
  return { title: t("title") };
}

export default async function PlansPage({ searchParams }: PageProps<"/plans">) {
  const filters = parsePlanParams(await searchParams);
  const isTemplates = filters.tab === "templates";
  const t = await getTranslations("Plans");
  const tTemplates = await getTranslations("Templates");
  const { list, customers, assignable, timeZone } = await withPhysio(async (tx, physioId) => {
    const everyone = { q: "", sort: "name", archived: false } as const;
    // Templates have no customer filter; the active customers are who a template can be assigned to.
    const [planList, active, archived, profile] = await Promise.all([
      listPlans(tx, physioId, filters),
      listCustomers(tx, physioId, everyone),
      isTemplates ? null : listCustomers(tx, physioId, { ...everyone, archived: true }),
      getProfile(tx, physioId),
    ]);
    return {
      list: planList,
      customers: [...active.customers, ...(archived?.customers ?? [])].map((customer) => ({
        id: customer.id,
        name: customerName(customer.firstName, customer.lastName),
      })),
      assignable: active.customers.map((customer) => ({
        id: customer.id,
        name: customerName(customer.firstName, customer.lastName),
      })),
      timeZone: profile?.timezone ?? "UTC",
    };
  });
  const { plans, truncated } = list;
  const filtered = hasActivePlanFilters(filters);
  const nothingYet = plans.length === 0 && !filtered;
  // An empty list offers the same button in its empty state.
  const newButton = nothingYet ? undefined : isTemplates ? (
    <NewTemplateButton kind="plan" />
  ) : assignable.length > 0 ? (
    <NewForCustomerPicker kind="plan" customers={assignable} />
  ) : undefined;

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} primary={newButton} />
      <PendingScope>
        <ListTabs kind="plan" active={filters.tab} />
        {nothingYet ? (
          <PendingContent>
            {isTemplates ? <EmptyTemplates kind="plan" /> : <EmptyPlans customers={assignable} />}
          </PendingContent>
        ) : (
          <div className="grid content-start gap-6">
            <PlansToolbar filters={filters} customers={customers} />
            <PendingContent>
              {plans.length > 0 ? (
                <div className="grid gap-3">
                  {truncated ? (
                    <p className="text-muted-foreground text-sm">
                      {isTemplates
                        ? tTemplates("list.truncated", { count: plans.length })
                        : t("list.truncated", { count: plans.length })}
                    </p>
                  ) : null}
                  {isTemplates ? (
                    <TemplateList
                      kind="plan"
                      timeZone={timeZone}
                      customers={assignable}
                      rows={plans.map((plan) => ({
                        id: plan.id,
                        name: plan.name,
                        status: plan.status,
                        updatedAt: plan.updatedAt,
                        sessionsPerDay: plan.sessionsPerDay,
                      }))}
                    />
                  ) : (
                    <PlanList plans={plans} showCustomer timeZone={timeZone} />
                  )}
                </div>
              ) : isTemplates ? (
                <NoTemplateResults kind="plan" canClear={filtered} />
              ) : (
                <NoPlanResults canClear={filtered} />
              )}
            </PendingContent>
          </div>
        )}
      </PendingScope>
    </div>
  );
}
