import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { CustomerForm } from "@/components/customers/customer-form";
import { PageHeader } from "@/components/page-header";
import { resolveLocale } from "@/i18n/config";
import { saveCustomerAction } from "@/server/customers/actions";
import { customerDisplayName, loadCustomer } from "@/server/customers/load";

export async function generateMetadata({
  params,
}: PageProps<"/customers/[customerId]/edit">): Promise<Metadata> {
  const { customerId } = await params;
  const loaded = await loadCustomer(customerId);
  const t = await getTranslations("Customers.form");
  return {
    title: loaded ? `${t("editTitle")} · ${customerDisplayName(loaded.customer)}` : t("editTitle"),
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
    <div className="grid gap-8">
      <div className="grid gap-2">
        <Link
          href={`/customers/${customer.id}`}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeftIcon aria-hidden className="size-4" />
          {t("detail.backToCustomer")}
        </Link>
        <PageHeader title={t("form.editTitle")} />
      </div>
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
