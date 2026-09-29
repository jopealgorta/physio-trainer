import Link from "next/link";
import { useTranslations } from "next-intl";

import { CUSTOMER_TABS, type CustomerTab } from "@/lib/customers";
import { cn } from "@/lib/utils";

/** URL-driven tabs: the overview is the bare customer URL, the others use `?tab=`. */
export function CustomerTabs({ customerId, active }: { customerId: string; active: CustomerTab }) {
  const t = useTranslations("Customers.tabs");
  return (
    <nav aria-label={t("label")} className="-mx-1 overflow-x-auto border-b px-1">
      <ul className="flex min-w-max gap-1">
        {CUSTOMER_TABS.map((tab) => {
          const current = tab === active;
          return (
            <li key={tab}>
              <Link
                href={
                  tab === "overview"
                    ? `/customers/${customerId}`
                    : `/customers/${customerId}?tab=${tab}`
                }
                aria-current={current ? "page" : undefined}
                className={cn(
                  "focus-visible:ring-ring/30 -mb-px inline-block rounded-t-md border-b-2 px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset",
                  current
                    ? "border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground border-transparent",
                )}
              >
                {t(tab)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
