import { MailIcon, MessageCircleIcon, PencilIcon, PhoneIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { Customer } from "@/db/schema";
import { telHref, whatsappHref } from "@/lib/phone";

import { CustomerArchiveButton } from "./customer-archive-button";
import { CustomerAvatar } from "./customer-avatar";

export type HeaderCustomer = Pick<
  Customer,
  "id" | "firstName" | "lastName" | "email" | "phone" | "archivedAt"
>;

/** Name, age, contact quick actions and edit/archive controls for the customer hub. */
export function CustomerHeader({
  customer,
  age,
}: {
  customer: HeaderCustomer;
  /** Completed years today in the physio's time zone; null when unknown. */
  age: number | null;
}) {
  const t = useTranslations("Customers.detail");
  const name = [customer.firstName, customer.lastName].filter(Boolean).join(" ");
  const tel = customer.phone ? telHref(customer.phone) : null;
  const whatsapp = customer.phone ? whatsappHref(customer.phone) : null;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <CustomerAvatar firstName={customer.firstName} lastName={customer.lastName} size="lg" />
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight wrap-anywhere">{name}</h1>
            {age !== null ? (
              <p className="text-muted-foreground text-sm">{t("age", { age })}</p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <Link href={`/customers/${customer.id}/edit`}>
              <PencilIcon aria-hidden />
              {t("edit")}
            </Link>
          </Button>
          <CustomerArchiveButton
            id={customer.id}
            name={name}
            archived={customer.archivedAt !== null}
          />
        </div>
      </div>
      {tel || customer.email || whatsapp ? (
        <div role="group" aria-label={t("contactLabel")} className="flex flex-wrap gap-2">
          {tel ? (
            <Button asChild variant="secondary">
              <a href={tel}>
                <PhoneIcon aria-hidden />
                {t("call")}
              </a>
            </Button>
          ) : null}
          {customer.email ? (
            <Button asChild variant="secondary">
              <a href={`mailto:${customer.email}`}>
                <MailIcon aria-hidden />
                {t("email")}
              </a>
            </Button>
          ) : null}
          {whatsapp ? (
            <Button asChild variant="secondary">
              <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                <MessageCircleIcon aria-hidden />
                {t("whatsapp")}
              </a>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
