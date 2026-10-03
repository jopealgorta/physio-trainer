import { UsersIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { LinkPendingHint } from "@/components/navigation-pending";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { customersHref, DEFAULT_CUSTOMER_FILTERS } from "@/lib/customer-params";

/** The physio has no customers at all: full-page call to action. */
export function EmptyCustomers() {
  const t = useTranslations("Customers.empty");
  return (
    <Card>
      <CardContent className="mx-auto grid max-w-md justify-items-center gap-3 py-10 text-center">
        <UsersIcon aria-hidden className="text-primary size-8" />
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p className="text-muted-foreground text-sm">{t("body")}</p>
        <Button asChild>
          <Link href="/customers/new">{t("cta")}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Filters or search matched nothing. Without an active filter the only customers left are
 * archived, so there is nothing to clear: point at "Show archived" instead.
 */
export function NoCustomerResults({ canClear }: { canClear: boolean }) {
  const t = useTranslations("Customers.noResults");
  return (
    <Card>
      <CardContent className="mx-auto grid max-w-md justify-items-center gap-3 py-10 text-center">
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p className="text-muted-foreground text-sm">{t(canClear ? "body" : "allArchived")}</p>
        {canClear ? (
          <Button asChild variant="outline">
            <Link href={customersHref(DEFAULT_CUSTOMER_FILTERS)} className="relative">
              {t("clear")}
              <LinkPendingHint className="inset-x-3 bottom-1" />
            </Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
