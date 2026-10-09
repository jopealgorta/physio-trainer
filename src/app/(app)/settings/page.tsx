import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { BrandingForm } from "@/components/branding/branding-form";
import { PendingContent, PendingScope } from "@/components/navigation-pending";
import { PageHeader } from "@/components/page-header";
import { ProfileForm } from "@/components/physios/profile-form";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { Button } from "@/components/ui/button";
import { settingsSection } from "@/config/settings";
import { env } from "@/env";
import { firstParam } from "@/lib/search-params";
import { signOut } from "@/server/auth/actions";
import { requirePhysio } from "@/server/auth/session";
import { updateBrandingAction } from "@/server/branding/actions";
import { brandingSource } from "@/server/branding/queries";
import { checkHandleAction, updateProfileAction } from "@/server/physios/actions";
import { profileFormOptions } from "@/server/physios/form-options";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Settings");
  return { title: t("title") };
}

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const { profile } = await requirePhysio();
  const section = settingsSection(firstParam((await searchParams).section));
  const t = await getTranslations("Settings");

  return (
    <PendingScope>
      <div className="grid gap-6">
        <div className="grid gap-3">
          <PageHeader title={t("title")} />
          <SettingsTabs current={section} />
        </div>
        <PendingContent>
          {section === "profile" && (
            <ProfileForm
              mode="settings"
              action={updateProfileAction}
              checkHandle={checkHandleAction}
              defaults={{
                displayName: profile.displayName,
                handle: profile.handle,
                locale: profile.locale,
                timezone: profile.timezone,
              }}
              savedHandle={profile.handle}
              {...profileFormOptions()}
            />
          )}
          {section === "branding" && (
            <BrandingForm
              action={updateBrandingAction}
              defaults={brandingSource(profile)}
              linkHost={new URL(env.NEXT_PUBLIC_APP_URL).host}
            />
          )}
          {section === "account" && (
            <div className="flex max-w-2xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm">
                <span className="text-muted-foreground">{t("account.email")}: </span>
                {profile.email}
              </p>
              <form action={signOut}>
                <Button type="submit" variant="outline">
                  {t("account.signOut")}
                </Button>
              </form>
            </div>
          )}
        </PendingContent>
      </div>
    </PendingScope>
  );
}
