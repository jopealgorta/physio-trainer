import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { CustomerHeader } from "@/components/customers/customer-header";
import { CustomerOverview } from "@/components/customers/customer-overview";
import { CustomerTabs } from "@/components/customers/customer-tabs";
import { TabEmpty } from "@/components/customers/tab-empty";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ageInYears } from "@/lib/calendar-date";
import { parseCustomerTab } from "@/lib/customers";
import { firstParam } from "@/lib/search-params";
import { customerDisplayName, loadCustomer } from "@/server/customers/load";

export async function generateMetadata({
  params,
}: PageProps<"/customers/[customerId]">): Promise<Metadata> {
  const { customerId } = await params;
  const loaded = await loadCustomer(customerId);
  return { title: loaded ? customerDisplayName(loaded.customer) : undefined };
}

export default async function CustomerPage({
  params,
  searchParams,
}: PageProps<"/customers/[customerId]">) {
  const [{ customerId }, sp] = await Promise.all([params, searchParams]);
  const loaded = await loadCustomer(customerId);
  if (!loaded) notFound();
  const { customer, timezone } = loaded;
  const tab = parseCustomerTab(firstParam(sp.tab));
  const t = await getTranslations("Customers");

  const age = customer.dateOfBirth ? ageInYears(customer.dateOfBirth, timezone) : null;

  return (
    <div className="grid gap-6">
      <div className="grid gap-4">
        <Link
          href="/customers"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeftIcon aria-hidden className="size-4" />
          {t("form.back")}
        </Link>
        <CustomerHeader customer={customer} age={age} />
      </div>
      {customer.archivedAt ? (
        <Alert>
          <AlertDescription>{t("detail.archivedNotice")}</AlertDescription>
        </Alert>
      ) : null}
      <CustomerTabs customerId={customer.id} active={tab} />
      {tab === "overview" ? <CustomerOverview customer={customer} /> : <TabEmpty tab={tab} />}
    </div>
  );
}
