import Link from "next/link";

import { AppNav, MobileNav } from "@/components/app-nav";
import { Logo } from "@/components/logo";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { env } from "@/env";
import { requirePhysio } from "@/server/auth/session";

/**
 * Physio workspace shell. Requires a signed-in, onboarded physio.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { profile } = await requirePhysio();

  return (
    <div className="flex min-h-svh flex-1">
      <aside className="bg-sidebar sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r px-3 py-4 md:flex">
        <Link href="/dashboard" className="px-3 pb-6">
          <Logo />
        </Link>
        <AppNav group="main" />
        <div className="mt-auto flex items-end justify-between gap-2">
          <UserMenu
            name={profile.displayName}
            email={profile.email}
            avatarUrl={profile.avatarUrl}
            className="flex-1"
          />
          <ThemeToggle />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background/80 sticky top-0 z-10 border-b backdrop-blur md:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <Link href="/dashboard">
              <Logo />
            </Link>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <UserMenu
                name={profile.displayName}
                email={profile.email}
                avatarUrl={profile.avatarUrl}
                compact
              />
            </div>
          </div>
          <MobileNav />
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-10 md:py-10">
          {children}
        </main>
      </div>
      <ServiceWorkerRegistration buildId={env.NEXT_PUBLIC_BUILD_ID} />
    </div>
  );
}
