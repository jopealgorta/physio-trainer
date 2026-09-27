"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { navGroups, type NavGroup } from "@/config/nav";
import { cn } from "@/lib/utils";

export function AppNav({ group, className }: { group: NavGroup; className?: string }) {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const items = navGroups[group];

  return (
    <nav className={cn("flex flex-col gap-0.5", className)}>
      {items.map(({ href, labelKey, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
            )}
          >
            <Icon className="size-4" />
            {t(labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}

/** Compact horizontal nav for small screens. */
export function MobileNav() {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const items = navGroups.all;

  return (
    <nav className="flex gap-1 overflow-x-auto px-4 pb-2 md:hidden">
      {items.map(({ href, labelKey }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "text-muted-foreground shrink-0 rounded-full px-3 py-1.5 text-sm",
              active && "bg-secondary text-secondary-foreground font-medium",
            )}
          >
            {t(labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
