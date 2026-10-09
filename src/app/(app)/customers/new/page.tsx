import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CustomerForm } from "@/components/customers/customer-form";
import { PageHeader } from "@/components/page-header";
import { defaultLocale, resolveLocale } from "@/i18n/config";
import { withPhysio } from "@/server/auth/session";
import { saveCustomerAction } from "@/server/customers/actions";
import { getProfile } from "@/server/physios/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Customers.form");
  return { title: t("newTitle") };
}

export default async function NewCustomerPage() {
  const t = await getTranslations("Customers.form");
  const profile = await withPhysio((tx, physioId) => getProfile(tx, physioId));
  return (
    <div className="grid gap-6">
      <PageHeader back={{ href: "/customers", label: t("back") }} title={t("newTitle")} />
      <CustomerForm
        action={saveCustomerAction}
        cancelHref="/customers"
        defaults={{
          firstName: "",
          lastName: null,
          email: null,
          phone: null,
          dateOfBirth: null,
          sex: null,
          occupation: null,
          activity: null,
          medicalHistory: null,
          locale: resolveLocale(profile?.locale ?? defaultLocale),
        }}
      />
    </div>
  );
}
