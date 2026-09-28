import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { LoginForm } from "@/components/auth/login-form";
import { Logo } from "@/components/logo";
import { env } from "@/env";
import { parseLoginError } from "@/lib/auth/login-errors";
import { safeNextPath } from "@/lib/redirects";
import { firstParam } from "@/lib/search-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Login");
  return { title: t("title") };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <Logo />
      <LoginForm
        next={safeNextPath(firstParam(params.next))}
        googleEnabled={env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED}
        error={parseLoginError(firstParam(params.error))}
      />
    </main>
  );
}
