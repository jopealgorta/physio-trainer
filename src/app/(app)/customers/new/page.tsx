import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
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
    <div className="grid gap-8">
      <div className="grid gap-2">
        <Link
          href="/customers"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeftIcon aria-hidden className="size-4" />
          {t("back")}
        </Link>
        <PageHeader title={t("newTitle")} />
      </div>
      <CustomerForm
        action={saveCustomerAction}
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
