import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { ProfileForm } from "@/components/physios/profile-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signOut } from "@/server/auth/actions";
import { requirePhysio } from "@/server/auth/session";
import { checkHandleAction, updateProfileAction } from "@/server/physios/actions";
import { profileFormOptions } from "@/server/physios/form-options";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Settings");
  return { title: t("title") };
}

export default async function SettingsPage() {
  const { profile } = await requirePhysio();
  const t = await getTranslations("Settings");

  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} />
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
    </div>
  );
}
