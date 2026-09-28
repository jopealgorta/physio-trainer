import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { OfflineScreen } from "@/components/offline-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Offline");
  return { title: t("title"), robots: { index: false } };
}

/** Cached by public/sw.js and served when a navigation fails (docs/specs/18-pwa.md). */
export default function OfflinePage() {
  return <OfflineScreen />;
}
