"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { PhysioAvatar } from "@/components/physio-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { signOut } from "@/server/auth/actions";

export function UserMenu({
  name,
  email,
  avatarUrl,
  compact = false,
  className,
}: {
  name: string;
  email: string;
  /** The sign-in photo (Google); the initial shows when null or when it fails to load. */
  avatarUrl: string | null;
  /** Avatar-only trigger for the mobile header. */
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations("UserMenu");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          aria-label={t("trigger")}
          className={cn(
            compact ? "size-9 rounded-full p-0" : "h-auto min-w-0 justify-start gap-3 px-2 py-2",
            className,
          )}
        >
          <PhysioAvatar name={name} src={avatarUrl} alt={t("photoAlt", { name })} />
          {compact ? null : (
            <span className="grid min-w-0 text-left">
              <span className="truncate text-sm font-medium">{name}</span>
              <span className="text-muted-foreground truncate text-xs">{email}</span>
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="grid">
          <span className="truncate">{name}</span>
          <span className="text-muted-foreground truncate text-xs font-normal">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">{t("settings")}</Link>
        </DropdownMenuItem>
        {/* Call the action directly: a <form> inside the menu unmounts before it can submit. */}
        <DropdownMenuItem onSelect={() => void signOut()}>{t("signOut")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
