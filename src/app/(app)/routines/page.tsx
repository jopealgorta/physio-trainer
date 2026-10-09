import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { NewForCustomerPicker } from "@/components/new-for-customer-picker";
import { PendingContent, PendingScope } from "@/components/navigation-pending";
import { PageHeader } from "@/components/page-header";
import { EmptyRoutines, NoRoutineResults, RoutineList } from "@/components/routines/routine-list";
import { RoutinesToolbar } from "@/components/routines/routines-toolbar";
import { ListTabs } from "@/components/templates/list-tabs";
import { NewTemplateButton } from "@/components/templates/new-template-button";
import {
  EmptyTemplates,
  NoTemplateResults,
  TemplateList,
} from "@/components/templates/template-list";
import { customerName } from "@/lib/customers";
import { hasActiveRoutineFilters, parseRoutineParams } from "@/lib/routine-params";
import { withPhysio } from "@/server/auth/session";
import { listCustomers } from "@/server/customers/queries";
import { getProfile } from "@/server/physios/queries";
import { listRoutines } from "@/server/routines/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Routines");
  return { title: t("title") };
}

export default async function RoutinesPage({ searchParams }: PageProps<"/routines">) {
  const filters = parseRoutineParams(await searchParams);
  const isTemplates = filters.tab === "templates";
  const t = await getTranslations("Routines");
  const tTemplates = await getTranslations("Templates");
  const { list, customers, assignable, timeZone } = await withPhysio(async (tx, physioId) => {
    const everyone = { q: "", sort: "name", archived: false } as const;
    // Templates have no customer filter; the active customers are who a template can be assigned to.
    const [routineList, active, archived, profile] = await Promise.all([
      listRoutines(tx, physioId, filters),
      listCustomers(tx, physioId, everyone),
      isTemplates ? null : listCustomers(tx, physioId, { ...everyone, archived: true }),
      getProfile(tx, physioId),
    ]);
    return {
      list: routineList,
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
  const { routines, truncated } = list;
  const filtered = hasActiveRoutineFilters(filters);
  const nothingYet = routines.length === 0 && !filtered;
  // An empty list offers the same button in its empty state.
  const newButton = nothingYet ? undefined : isTemplates ? (
    <NewTemplateButton kind="routine" />
  ) : assignable.length > 0 ? (
    <NewForCustomerPicker kind="routine" customers={assignable} />
  ) : undefined;

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} primary={newButton} />
      <PendingScope>
        <ListTabs kind="routine" active={filters.tab} />
        {nothingYet ? (
          <PendingContent>
            {isTemplates ? (
              <EmptyTemplates kind="routine" />
            ) : (
              <EmptyRoutines customers={assignable} />
            )}
          </PendingContent>
        ) : (
          <div className="grid content-start gap-6">
            <RoutinesToolbar filters={filters} customers={customers} />
            <PendingContent>
              {routines.length > 0 ? (
                <div className="grid gap-3">
                  {truncated ? (
                    <p className="text-muted-foreground text-sm">
                      {isTemplates
                        ? tTemplates("list.truncated", { count: routines.length })
                        : t("list.truncated", { count: routines.length })}
                    </p>
                  ) : null}
                  {isTemplates ? (
                    <TemplateList
                      kind="routine"
                      timeZone={timeZone}
                      customers={assignable}
                      rows={routines.map((routine) => ({
                        id: routine.id,
                        name: routine.name,
                        status: routine.status,
                        updatedAt: routine.updatedAt,
                        itemCount: routine.itemCount,
                      }))}
                    />
                  ) : (
                    <RoutineList routines={routines} showCustomer timeZone={timeZone} />
                  )}
                </div>
              ) : isTemplates ? (
                <NoTemplateResults kind="routine" canClear={filtered} />
              ) : (
                <NoRoutineResults canClear={filtered} />
              )}
            </PendingContent>
          </div>
        )}
      </PendingScope>
    </div>
  );
}
