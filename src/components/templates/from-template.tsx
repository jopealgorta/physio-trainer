"use client";

import type { Route } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { usePageAction } from "@/components/page-actions";
import type { TemplateKind } from "@/lib/templates";

const PATHS = { routine: "/routines", plan: "/plans" } as const;

/** "From template: X" on a copy; the link opens the template while it still exists. */
export function FromTemplate({
  kind,
  template,
}: {
  kind: TemplateKind;
  template: { id: string; name: string };
}) {
  const t = useTranslations("Templates");
  const href = `${PATHS[kind]}/${template.id}` as Route;
  usePageAction("fromTemplate", {
    label: t("fromMenu", { name: template.name }),
    order: 50,
    href,
  });
  return (
    <p className="text-muted-foreground text-sm">
      {t.rich("from", {
        link: () => (
          <Link
            href={href}
            className="text-foreground rounded-sm hover:underline focus-visible:underline"
          >
            {template.name}
          </Link>
        ),
      })}
    </p>
  );
}
