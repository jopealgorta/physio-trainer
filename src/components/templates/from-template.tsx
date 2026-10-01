import Link from "next/link";
import { useTranslations } from "next-intl";

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
  return (
    <p className="text-muted-foreground text-sm">
      {t.rich("from", {
        link: () => (
          <Link
            href={`${PATHS[kind]}/${template.id}`}
            className="text-foreground rounded-sm hover:underline focus-visible:underline"
          >
            {template.name}
          </Link>
        ),
      })}
    </p>
  );
}
