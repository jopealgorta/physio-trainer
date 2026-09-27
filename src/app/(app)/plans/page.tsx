import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SpecPlaceholder } from "@/components/spec-placeholder";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Nav");
  return { title: t("plans") };
}

export default async function Page() {
  const t = await getTranslations("Nav");
  return <SpecPlaceholder title={t("plans")} spec="docs/specs/06-weekly-plans.md" />;
}
