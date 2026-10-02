"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/**
 * The physio's sign-in photo (Google), or their initial on the accent colour when there is none
 * or it fails to load. Google's photo URLs can refuse requests that carry a referrer.
 */
export function PhysioAvatar({
  name,
  src,
  alt,
  className,
}: {
  name: string;
  src: string | null;
  alt: string;
  className?: string;
}) {
  const initial = Array.from(name.trim())[0]?.toLocaleUpperCase() || "?";
  return (
    <Avatar className={cn("size-7 text-xs after:hidden", className)}>
      {src ? <AvatarImage src={src} alt={alt} referrerPolicy="no-referrer" /> : null}
      <AvatarFallback
        aria-hidden
        className="bg-primary text-primary-foreground text-[length:inherit] font-semibold"
      >
        {initial}
      </AvatarFallback>
    </Avatar>
  );
}
