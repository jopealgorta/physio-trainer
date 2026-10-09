import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { CustomerHeader } from "@/components/customers/customer-header";
import { CustomerOverview } from "@/components/customers/customer-overview";
import { CustomerTabs } from "@/components/customers/customer-tabs";
import { CustomerActivity } from "@/components/activity/customer-activity";
import { CustomerPlans } from "@/components/plans/customer-plans";
import { CustomerRoutines } from "@/components/routines/customer-routines";
import { CustomerNotes } from "@/components/visit-notes/customer-notes";
import { PendingContent, PendingScope } from "@/components/navigation-pending";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ageInYears, todayIn } from "@/lib/calendar-date";
import { customerName, parseCustomerTab, type CustomerTab } from "@/lib/customers";
import { firstParam } from "@/lib/search-params";
import { parseNotesParams, type NotesFilters } from "@/lib/visit-notes";
import { withPhysio } from "@/server/auth/session";
import { loadCustomer } from "@/server/customers/load";
import type { CustomerDetail } from "@/server/customers/queries";
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

  return (
    <div className="grid gap-6">
      <CustomerHeader
        customer={customer}
        age={age}
        back={{ href: "/customers", label: t("form.back") }}
      />
      {customer.archivedAt ? (
        <Alert role="status">
          <AlertDescription>{t("detail.archivedNotice")}</AlertDescription>
        </Alert>
      ) : null}
      <PendingScope>
        <CustomerTabs customerId={customer.id} active={tab} />
        <PendingContent>
          <TabContent
            tab={tab}
            customer={customer}
            timeZone={timezone}
            notesFilters={parseNotesParams(sp)}
          />
        </PendingContent>
      </PendingScope>
    </div>
  );
}

async function TabContent({
  tab,
  customer,
  timeZone,
  notesFilters,
}: {
  tab: CustomerTab;
  customer: CustomerDetail;
  timeZone: string;
  notesFilters: NotesFilters;
}) {
  const name = customerName(customer.firstName, customer.lastName);
  const caseOptions = customer.cases.map(({ id, title }) => ({ id, title }));
  const archived = customer.archivedAt !== null;

  switch (tab) {
    case "overview": {
      const latestNote = await withPhysio((tx, physioId) =>
        latestVisitNote(tx, physioId, customer.id),
      );
      return (
        <CustomerOverview customer={customer} today={todayIn(timeZone)} latestNote={latestNote} />
      );
    }
    case "routines":
      return (
        <CustomerRoutines
          customerId={customer.id}
          customerName={name}
          cases={caseOptions}
          archived={archived}
          timeZone={timeZone}
        />
      );
    case "plans":
      return (
        <CustomerPlans
          customerId={customer.id}
          customerName={name}
          cases={caseOptions}
          archived={archived}
          timeZone={timeZone}
        />
      );
    case "notes":
      return (
        <CustomerNotes
          customerId={customer.id}
          customerName={name}
          cases={caseOptions}
          today={todayIn(timeZone)}
          timeZone={timeZone}
          filters={notesFilters}
        />
      );
    case "activity":
      return <CustomerActivity customerId={customer.id} customerName={name} timeZone={timeZone} />;
  }
}
