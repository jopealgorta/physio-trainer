import { ArrowLeftIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

/** The way back from a detail or form page, above its title. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href as Route}
      className="text-muted-foreground hover:text-foreground inline-flex min-w-0 items-center gap-1 justify-self-start text-sm"
    >
      <ArrowLeftIcon aria-hidden className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}
