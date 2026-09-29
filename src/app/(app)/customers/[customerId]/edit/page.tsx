import { ArrowLeftIcon } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";

import { CustomerForm } from "@/components/customers/customer-form";
import { PageHeader } from "@/components/page-header";
import { resolveLocale } from "@/i18n/config";
import { withPhysio } from "@/server/auth/session";
import { saveCustomerAction } from "@/server/customers/actions";
import { getCustomer } from "@/server/customers/queries";
import { idSchema } from "@/server/customers/schemas";

// Shared by generateMetadata and the page within one request.
const loadCustomer = cache(async (rawId: string) => {
  const parsed = idSchema.safeParse(rawId);
  if (!parsed.success) return null;
  return withPhysio((tx, physioId) => getCustomer(tx, physioId, parsed.data));
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Customers.form");
  return { title: t("editTitle") };
}

export default async function EditCustomerPage({
  params,
}: PageProps<"/customers/[customerId]/edit">) {
  const { customerId } = await params;
  const customer = await loadCustomer(customerId);
  if (!customer) notFound();
  const t = await getTranslations("Customers.form");

  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <Link
          href={`/customers/${customer.id}` as Route}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeftIcon aria-hidden className="size-4" />
          {t("cancel")}
        </Link>
        <PageHeader title={t("editTitle")} />
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
