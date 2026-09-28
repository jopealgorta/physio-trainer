import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { BrandingForm } from "@/components/branding/branding-form";
import { PageHeader } from "@/components/page-header";
import { ProfileForm } from "@/components/physios/profile-form";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="grid gap-8">
      <div className="grid gap-4">
        <PageHeader title={t("title")} />
        <SettingsTabs current={section} />
      </div>
      {section === "profile" && (
        <Card>
          <CardHeader>
            <CardTitle>{t("profile.title")}</CardTitle>
            <CardDescription>{t("profile.description")}</CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      )}
      {section === "branding" && (
        <Card>
          <CardHeader>
            <CardTitle>{t("branding.title")}</CardTitle>
            <CardDescription>{t("branding.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <BrandingForm
              action={updateBrandingAction}
              defaults={brandingSource(profile)}
              linkHost={new URL(env.NEXT_PUBLIC_APP_URL).host}
            />
          </CardContent>
        </Card>
      )}
      {section === "account" && (
        <Card>
          <CardHeader>
            <CardTitle>{t("account.title")}</CardTitle>
            <CardDescription>{t("account.description")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">
              <span className="text-muted-foreground">{t("account.email")}: </span>
              {profile.email}
            </p>
            <form action={signOut}>
              <Button type="submit" variant="outline">
                {t("account.signOut")}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
