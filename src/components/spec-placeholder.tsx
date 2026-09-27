import { ConstructionIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";

/** Temporary page body for sections whose feature spec is not implemented yet. */
export async function SpecPlaceholder({ title, spec }: { title: string; spec: string }) {
  const t = await getTranslations("Placeholder");

  return (
    <div className="space-y-8">
      <PageHeader title={title} />
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-20 text-center">
        <ConstructionIcon className="text-muted-foreground size-6" />
        <p className="font-medium">{t("comingSoon")}</p>
        <p className="text-muted-foreground text-sm">
          {t.rich("specHint", {
            spec,
            code: (chunks) => <code className="font-mono text-xs">{chunks}</code>,
          })}
        </p>
      </div>
    </div>
  );
}
