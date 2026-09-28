import type { MetadataRoute } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { buildManifest } from "@/lib/pwa";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("Metadata")]);
  return buildManifest({ locale, name: t("title"), description: t("description") });
}
