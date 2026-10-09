import { MailIcon, MessageCircleIcon, PencilIcon, PhoneIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { ExportMenu } from "@/components/export/export-menu";
import { PageActionLink } from "@/components/page-action-link";
import { PageActions } from "@/components/page-actions";
import { PageHeader } from "@/components/page-header";
import { ShareButton } from "@/components/sharing/share-button";
import { Button } from "@/components/ui/button";
import type { Customer } from "@/db/schema";
import { customerName } from "@/lib/customers";
import { telHref, whatsappHref } from "@/lib/phone";

import { CustomerArchiveAction } from "./customer-archive-action";
import { CustomerAvatar } from "./customer-avatar";

export type HeaderCustomer = Pick<
  Customer,
  "id" | "firstName" | "lastName" | "email" | "phone" | "archivedAt"
>;

/**
 * The customer hub's header: the way back, avatar, name and age; Edit, Export and Share (the main
 * action) with Archive/Restore in the "⋯" menu; then the contact quick actions.
 */
export function CustomerHeader({
  customer,
  age,
  back,
}: {
  customer: HeaderCustomer;
  /** Completed years today in the physio's time zone; null when unknown. */
  age: number | null;
  back: { href: string; label: string };
}) {
  const t = useTranslations("Customers.detail");
  const name = customerName(customer.firstName, customer.lastName);
  const tel = customer.phone ? telHref(customer.phone) : null;
  const whatsapp = customer.phone ? whatsappHref(customer.phone) : null;
  const archived = customer.archivedAt !== null;

  return (
    <PageActions>
      <div className="grid gap-4">
        <PageHeader
          back={back}
          leading={
            <CustomerAvatar firstName={customer.firstName} lastName={customer.lastName} size="lg" />
          }
          title={name}
          meta={age !== null ? <span>{t("age", { age })}</span> : undefined}
          actions={
            <>
              <PageActionLink
                id="edit"
                href={`/customers/${customer.id}/edit`}
                label={t("edit")}
                order={0}
                icon={<PencilIcon aria-hidden />}
              />
              <ExportMenu target={{ kind: "customers", id: customer.id }} />
            </>
          }
          primary={
            // Archived customers' links are revoked and cannot be recreated until restored.
            archived ? undefined : (
              <ShareButton primary target={{ target: "customer", customerId: customer.id }} />
            )
          }
        />
        <CustomerArchiveAction id={customer.id} name={name} archived={archived} />
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
    </PageActions>
  );
}
