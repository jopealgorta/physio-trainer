import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { LinkPendingHint } from "@/components/navigation-pending";
import { SETTINGS_SECTIONS, settingsHref, type SettingsSection } from "@/config/settings";
import { cn } from "@/lib/utils";

export async function SettingsTabs({ current }: { current: SettingsSection }) {
  const t = await getTranslations("Settings.tabs");
  return (
    <nav aria-label={t("label")} className="-mb-px flex gap-4 overflow-x-auto border-b">
      {SETTINGS_SECTIONS.map((section) => (
        <Link
          key={section}
          href={settingsHref(section)}
          aria-current={section === current ? "page" : undefined}
          className={cn(
            "relative border-b-2 px-1 pb-2 text-sm font-medium whitespace-nowrap transition-colors",
            section === current
              ? "border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground border-transparent",
          )}
        >
          {t(section)}
          <LinkPendingHint />
        </Link>
      ))}
    </nav>
  );
}
