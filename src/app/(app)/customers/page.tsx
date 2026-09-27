import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SpecPlaceholder } from "@/components/spec-placeholder";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Nav");
  return { title: t("customers") };
}

export default async function Page() {
  const t = await getTranslations("Nav");
  return <SpecPlaceholder title={t("customers")} spec="docs/specs/04-customers-and-cases.md" />;
}
