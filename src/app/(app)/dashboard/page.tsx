import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SpecPlaceholder } from "@/components/spec-placeholder";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Nav");
  return { title: t("dashboard") };
}

export default async function Page() {
  const t = await getTranslations("Nav");
  return (
    <SpecPlaceholder title={t("dashboard")} spec="docs/specs/13-session-logging-and-dashboard.md" />
  );
}
