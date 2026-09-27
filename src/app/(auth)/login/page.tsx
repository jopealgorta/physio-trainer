import type { Metadata } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Login");
  return { title: t("title") };
}

// Placeholder until docs/specs/01-auth-and-physio-profile.md is implemented.
export default function LoginPage() {
  const t = useTranslations("Login");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <Logo />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild variant="outline" className="w-full">
            <Link href="/">{t("back")}</Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
