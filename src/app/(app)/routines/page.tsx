import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { EmptyRoutines, NoRoutineResults, RoutineList } from "@/components/routines/routine-list";
import { RoutinesToolbar } from "@/components/routines/routines-toolbar";
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
  const t = await getTranslations("Routines");
  const { list, customers, timeZone } = await withPhysio(async (tx, physioId) => {
    const everyone = { q: "", sort: "name", archived: false } as const;
    const [routineList, active, archived, profile] = await Promise.all([
      listRoutines(tx, physioId, filters),
      listCustomers(tx, physioId, everyone),
      listCustomers(tx, physioId, { ...everyone, archived: true }),
      getProfile(tx, physioId),
    ]);
    return {
      list: routineList,
      customers: [...active.customers, ...archived.customers].map((customer) => ({
        id: customer.id,
        name: customerName(customer.firstName, customer.lastName),
      })),
      timeZone: profile?.timezone ?? "UTC",
    };
  });
  const { routines, truncated } = list;
  const filtered = hasActiveRoutineFilters(filters);

  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} />
      {routines.length === 0 && !filtered ? (
        <EmptyRoutines />
      ) : (
        <div className="grid content-start gap-6">
          <RoutinesToolbar filters={filters} customers={customers} />
          {routines.length > 0 ? (
            <div className="grid gap-3">
              {truncated ? (
                <p className="text-muted-foreground text-sm">
                  {t("list.truncated", { count: routines.length })}
                </p>
              ) : null}
              <RoutineList routines={routines} showCustomer timeZone={timeZone} />
            </div>
          ) : (
            <NoRoutineResults canClear={filtered} />
          )}
        </div>
      )}
    </div>
  );
}
