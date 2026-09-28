import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { Logo } from "@/components/logo";
import { ProfileForm } from "@/components/physios/profile-form";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { isPlaceholderHandle } from "@/lib/handles";
import { safeNextPath } from "@/lib/redirects";
import { firstParam } from "@/lib/search-params";
import { withPhysio } from "@/server/auth/session";
import { checkHandleAction, completeOnboardingAction } from "@/server/physios/actions";
import { profileFormOptions } from "@/server/physios/form-options";
import { getProfile, suggestHandle } from "@/server/physios/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Onboarding");
  return { title: t("title") };
}

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const next = safeNextPath(firstParam((await searchParams).next));
  const { profile, suggestion } = await withPhysio(async (tx, physioId) => {
    const profile = await getProfile(tx, physioId);
    const suggestion =
      profile && isPlaceholderHandle(profile.handle)
        ? await suggestHandle(tx, profile.displayName)
        : null;
    return { profile, suggestion };
  });
  if (!profile) redirect("/login");
  if (profile.onboardedAt) redirect(next as Route);

  const t = await getTranslations("Onboarding");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <Logo />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <h1 className="leading-none font-semibold">{t("title")}</h1>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            mode="onboarding"
            action={completeOnboardingAction}
            checkHandle={checkHandleAction}
            defaults={{
              displayName: profile.displayName,
              handle: suggestion ?? profile.handle,
              locale: profile.locale,
              timezone: profile.timezone,
            }}
            savedHandle={profile.handle}
            next={next}
            {...profileFormOptions(await getLocale())}
          />
        </CardContent>
      </Card>
    </main>
  );
}
