import type { Route } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { LinkPendingHint } from "@/components/navigation-pending";
import { LIST_TABS, type ListTab, type TemplateKind } from "@/lib/templates";
import { cn } from "@/lib/utils";

const PATHS = { routine: "/routines", plan: "/plans" } as const;

/**
 * "Customers" / "Templates" tabs of /routines and /plans: the customers tab is the bare path,
 * the templates tab is `?tab=templates`. Switching tabs drops every other filter.
 */
export function ListTabs({ kind, active }: { kind: TemplateKind; active: ListTab }) {
  const t = useTranslations("Templates.tabs");
  return (
    <nav aria-label={t("label")} className="-mx-1 overflow-x-auto overflow-y-hidden border-b px-1">
      <ul className="flex min-w-max gap-1">
        {LIST_TABS.map((tab) => {
          const current = tab === active;
          const href = tab === "templates" ? `${PATHS[kind]}?tab=templates` : PATHS[kind];
          return (
            <li key={tab}>
              <Link
                href={href as Route}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "focus-visible:ring-ring/30 relative inline-block rounded-t-md border-b-2 px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset",
                  current
                    ? "border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground border-transparent",
                )}
              >
                {t(tab)}
                <LinkPendingHint />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
