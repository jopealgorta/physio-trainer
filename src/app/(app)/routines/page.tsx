import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { EmptyRoutines, NoRoutineResults, RoutineList } from "@/components/routines/routine-list";
import { RoutinesToolbar } from "@/components/routines/routines-toolbar";
import { ListTabs } from "@/components/templates/list-tabs";
import { NewTemplateDialog } from "@/components/templates/new-template-dialog";
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
  const { list, customers, timeZone } = await withPhysio(async (tx, physioId) => {
    const everyone = { q: "", sort: "name", archived: false } as const;
    // Templates have no customer, so that tab has no customer filter to feed.
    const [routineList, active, archived, profile] = await Promise.all([
      listRoutines(tx, physioId, filters),
      isTemplates ? null : listCustomers(tx, physioId, everyone),
      isTemplates ? null : listCustomers(tx, physioId, { ...everyone, archived: true }),
      getProfile(tx, physioId),
    ]);
    return {
      list: routineList,
      customers: [...(active?.customers ?? []), ...(archived?.customers ?? [])].map((customer) => ({
        id: customer.id,
        name: customerName(customer.firstName, customer.lastName),
      })),
      timeZone: profile?.timezone ?? "UTC",
    };
  });
  const { routines, truncated } = list;
  const filtered = hasActiveRoutineFilters(filters);
  const nothingYet = routines.length === 0 && !filtered;

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        actions={isTemplates && !nothingYet ? <NewTemplateDialog kind="routine" /> : undefined}
      />
      <ListTabs kind="routine" active={filters.tab} />
      {nothingYet ? (
        isTemplates ? (
          <EmptyTemplates kind="routine" />
        ) : (
          <EmptyRoutines />
        )
      ) : (
        <div className="grid content-start gap-6">
          <RoutinesToolbar filters={filters} customers={customers} />
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
        </div>
      )}
    </div>
  );
}
