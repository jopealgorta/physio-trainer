import { useTranslations } from "next-intl";

import { Card, CardContent } from "@/components/ui/card";
import type { CustomerTab } from "@/lib/customers";

/** Placeholder for hub tabs whose content arrives with later specs. */
export function TabEmpty({ tab }: { tab: Exclude<CustomerTab, "overview"> }) {
  const t = useTranslations("Customers.tabEmpty");
  return (
    <Card>
      <CardContent className="text-muted-foreground py-10 text-center text-sm">
        {t(tab)}
      </CardContent>
    </Card>
  );
}
