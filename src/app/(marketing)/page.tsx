import Link from "next/link";
import { useTranslations } from "next-intl";

import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  const t = useTranslations("Landing");

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
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/login">{t("primaryCta")}</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/dashboard">{t("secondaryCta")}</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
