import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { getSessionPhysio } from "@/server/auth/session";

export default async function LandingPage() {
  const t = await getTranslations("Landing");
  const session = await getSessionPhysio();

  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <Logo />
        <ThemeToggle />
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 px-6 pb-24 text-center">
        <p className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          {t("eyebrow")}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          {t("headline")}
        </h1>
        <p className="text-muted-foreground max-w-xl text-lg text-pretty">{t("subheadline")}</p>
        <Button asChild size="lg">
          {session ? (
            <Link href="/dashboard">{t("dashboardCta")}</Link>
          ) : (
            <Link href="/login">{t("primaryCta")}</Link>
          )}
        </Button>
      </main>
    </div>
  );
}
