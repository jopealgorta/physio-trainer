import { useTranslations } from "next-intl";

import { IntentLink } from "@/components/intent-link";
import { BodyAreaBadge } from "@/components/body-areas/body-area-badge";
import { Badge } from "@/components/ui/badge";
import { customerName } from "@/lib/customers";
import type { CustomerSummary } from "@/server/customers/queries";

import { CustomerAvatar } from "./customer-avatar";

function NameLink({ customer, eager }: { customer: CustomerSummary; eager: boolean }) {
  const t = useTranslations("Customers");
  return (
    <IntentLink
      href={`/customers/${customer.id}`}
      eager={eager}
      className="focus-visible:ring-ring/30 flex min-w-0 items-center gap-3 rounded-md font-medium outline-none hover:underline focus-visible:ring-2"
    >
      <CustomerAvatar firstName={customer.firstName} lastName={customer.lastName} size="sm" />
      <span className="min-w-0 truncate">
        {customerName(customer.firstName, customer.lastName)}
      </span>
      {customer.archivedAt ? <Badge variant="secondary">{t("archivedBadge")}</Badge> : null}
    </IntentLink>
  );
}

function ActiveCase({ customer }: { customer: CustomerSummary }) {
  const t = useTranslations("Customers");
  const active = customer.activeCase;
  if (!active) return <span className="text-muted-foreground text-sm">{t("noActiveCase")}</span>;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="min-w-0 truncate text-sm">{active.title}</span>
      {active.bodyArea ? <BodyAreaBadge area={active.bodyArea} side={active.side} /> : null}
    </div>
  );
}

export function CustomerResults({
  customers,
  truncated = false,
}: {
  customers: CustomerSummary[];
  /** More rows matched than the list cap. */
  truncated?: boolean;
}) {
  const t = useTranslations("Customers");
  return (
    <div className="grid gap-3">
      {truncated ? (
        <p className="text-muted-foreground text-sm">
          {t("truncated", { count: customers.length })}
        </p>
      ) : null}
      <table aria-label={t("title")} className="hidden w-full table-fixed text-sm md:table">
        <thead>
          <tr className="text-muted-foreground border-b text-left text-xs">
            <th scope="col" className="w-2/5 py-2 pr-3 font-medium">
              {t("name")}
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              {t("activeCase")}
            </th>
            <th scope="col" className="w-32 py-2 font-medium">
              {t("lastActivity")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {customers.map((customer, index) => (
            <tr key={customer.id}>
              <td className="min-w-0 py-2 pr-3">
                <NameLink customer={customer} eager={index === 0} />
              </td>
              <td className="min-w-0 py-2 pr-3">
                <ActiveCase customer={customer} />
              </td>
              <td className="text-muted-foreground py-2">{t("lastActivityNone")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="grid gap-3 md:hidden">
        {customers.map((customer, index) => (
          <li key={customer.id} className="grid min-w-0 gap-2 rounded-lg border p-3">
            <NameLink customer={customer} eager={index === 0} />
            <ActiveCase customer={customer} />
            <p className="text-muted-foreground text-xs">
              {t("lastActivity")}: {t("lastActivityNone")}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
