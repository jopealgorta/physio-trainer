import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { CustomerHeader } from "@/components/customers/customer-header";
import { CustomerOverview } from "@/components/customers/customer-overview";
import { CustomerTabs } from "@/components/customers/customer-tabs";
import { CustomerActivity } from "@/components/activity/customer-activity";
import { CustomerPlans } from "@/components/plans/customer-plans";
import { CustomerRoutines } from "@/components/routines/customer-routines";
import { CustomerNotes } from "@/components/visit-notes/customer-notes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ageInYears, todayIn } from "@/lib/calendar-date";
import { customerName, parseCustomerTab } from "@/lib/customers";
import { firstParam } from "@/lib/search-params";
import { parseNotesParams } from "@/lib/visit-notes";
import { withPhysio } from "@/server/auth/session";
import { loadCustomer } from "@/server/customers/load";
import { latestVisitNote } from "@/server/visit-notes/queries";

export async function generateMetadata({
  params,
}: PageProps<"/customers/[customerId]">): Promise<Metadata> {
  const { customerId } = await params;
  const loaded = await loadCustomer(customerId);
  return {
    title: loaded ? customerName(loaded.customer.firstName, loaded.customer.lastName) : undefined,
  };
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
  const name = customerName(customer.firstName, customer.lastName);
  const caseOptions = customer.cases.map(({ id, title }) => ({ id, title }));
  const latestNote =
    tab === "overview"
      ? await withPhysio((tx, physioId) => latestVisitNote(tx, physioId, customer.id))
      : null;

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
        <Alert role="status">
          <AlertDescription>{t("detail.archivedNotice")}</AlertDescription>
        </Alert>
      ) : null}
      <CustomerTabs customerId={customer.id} active={tab} />
      {tab === "overview" ? (
        <CustomerOverview customer={customer} today={todayIn(timezone)} latestNote={latestNote} />
      ) : tab === "routines" ? (
        <CustomerRoutines
          customerId={customer.id}
          customerName={name}
          cases={caseOptions}
          archived={customer.archivedAt !== null}
          timeZone={timezone}
        />
      ) : tab === "plans" ? (
        <CustomerPlans
          customerId={customer.id}
          customerName={name}
          cases={caseOptions}
          archived={customer.archivedAt !== null}
          timeZone={timezone}
        />
      ) : tab === "notes" ? (
        <CustomerNotes
          customerId={customer.id}
          customerName={name}
          cases={caseOptions}
          today={todayIn(timezone)}
          timeZone={timezone}
          filters={parseNotesParams(sp)}
        />
      ) : (
        <CustomerActivity customerId={customer.id} customerName={name} timeZone={timezone} />
      )}
    </div>
  );
}
