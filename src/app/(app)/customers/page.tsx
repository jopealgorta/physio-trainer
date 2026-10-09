import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { CustomerResults } from "@/components/customers/customer-results";
import { CustomerToolbar } from "@/components/customers/customer-toolbar";
import { EmptyCustomers, NoCustomerResults } from "@/components/customers/empty-customers";
import { PendingContent, PendingScope } from "@/components/navigation-pending";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { hasActiveCustomerFilters, parseCustomerParams } from "@/lib/customer-params";
import { withPhysio } from "@/server/auth/session";
import { hasAnyCustomers, listCustomers } from "@/server/customers/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Customers");
  return { title: t("title") };
}

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  const filters = parseCustomerParams(await searchParams);
  const t = await getTranslations("Customers");
  const [list, anyCustomers] = await withPhysio((tx, physioId) =>
    Promise.all([listCustomers(tx, physioId, filters), hasAnyCustomers(tx, physioId)]),
  );
  const { customers, truncated } = list;
  const showEmptyPage = !anyCustomers && !hasActiveCustomerFilters(filters);

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        primary={
          <Button asChild>
            <Link href="/customers/new">
              <PlusIcon aria-hidden /> {t("new")}
            </Link>
          </Button>
        }
      />
      {showEmptyPage ? (
        <EmptyCustomers />
      ) : (
        <PendingScope>
          <div className="grid content-start gap-6">
            <CustomerToolbar filters={filters} />
            <PendingContent>
              {customers.length > 0 ? (
                <CustomerResults customers={customers} truncated={truncated} />
              ) : (
                <NoCustomerResults canClear={hasActiveCustomerFilters(filters)} />
              )}
            </PendingContent>
          </div>
        </PendingScope>
      )}
    </div>
  );
}
