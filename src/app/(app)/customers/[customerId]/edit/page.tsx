import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { CustomerForm } from "@/components/customers/customer-form";
import { PageHeader } from "@/components/page-header";
import { resolveLocale } from "@/i18n/config";
import { customerName } from "@/lib/customers";
import { saveCustomerAction } from "@/server/customers/actions";
import { loadCustomer } from "@/server/customers/load";

export async function generateMetadata({
  params,
}: PageProps<"/customers/[customerId]/edit">): Promise<Metadata> {
  const { customerId } = await params;
  const loaded = await loadCustomer(customerId);
  const t = await getTranslations("Customers.form");
  return {
    title: loaded
      ? `${t("editTitle")} · ${customerName(loaded.customer.firstName, loaded.customer.lastName)}`
      : t("editTitle"),
  };
}

export default async function EditCustomerPage({
  params,
}: PageProps<"/customers/[customerId]/edit">) {
  const { customerId } = await params;
  const loaded = await loadCustomer(customerId);
  if (!loaded) notFound();
  const { customer } = loaded;
  const t = await getTranslations("Customers");

  return (
    <div className="grid gap-6">
      <PageHeader
        back={{ href: `/customers/${customer.id}`, label: t("detail.backToCustomer") }}
        title={t("form.editTitle")}
      />
      <CustomerForm
        action={saveCustomerAction}
        defaults={{
          id: customer.id,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          phone: customer.phone,
          dateOfBirth: customer.dateOfBirth,
          sex: customer.sex,
          occupation: customer.occupation,
          activity: customer.activity,
          medicalHistory: customer.medicalHistory,
          locale: resolveLocale(customer.locale),
        }}
      />
    </div>
  );
}
