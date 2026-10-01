import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { EmptyPlans, NoPlanResults, PlanList } from "@/components/plans/plan-list";
import { PlansToolbar } from "@/components/plans/plans-toolbar";
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
  const t = await getTranslations("Plans");
  const { list, customers, timeZone } = await withPhysio(async (tx, physioId) => {
    const everyone = { q: "", sort: "name", archived: false } as const;
    const [planList, active, archived, profile] = await Promise.all([
      listPlans(tx, physioId, filters),
      listCustomers(tx, physioId, everyone),
      listCustomers(tx, physioId, { ...everyone, archived: true }),
      getProfile(tx, physioId),
    ]);
    return {
      list: planList,
      customers: [...active.customers, ...archived.customers].map((customer) => ({
        id: customer.id,
        name: customerName(customer.firstName, customer.lastName),
      })),
      timeZone: profile?.timezone ?? "UTC",
    };
  });
  const { plans, truncated } = list;
  const filtered = hasActivePlanFilters(filters);

  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} />
      {plans.length === 0 && !filtered ? (
        <EmptyPlans />
      ) : (
        <div className="grid content-start gap-6">
          <PlansToolbar filters={filters} customers={customers} />
          {plans.length > 0 ? (
            <div className="grid gap-3">
              {truncated ? (
                <p className="text-muted-foreground text-sm">
                  {t("list.truncated", { count: plans.length })}
                </p>
              ) : null}
              <PlanList plans={plans} showCustomer timeZone={timeZone} />
            </div>
          ) : (
            <NoPlanResults canClear={filtered} />
          )}
        </div>
      )}
    </div>
  );
}
