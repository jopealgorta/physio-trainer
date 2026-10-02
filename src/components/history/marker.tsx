"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** An added (accent, "+") or removed (destructive, struck through) row of a diff. */
export function Marker({ kind, children }: { kind: "added" | "removed"; children: ReactNode }) {
  const t = useTranslations("History");
  return (
    <span className={cn(kind === "added" ? "text-primary" : "text-destructive line-through")}>
      <span aria-hidden className="me-1 inline-block w-3 no-underline">
        {kind === "added" ? "+" : "−"}
      </span>
      <span className="sr-only">{t(kind)} </span>
      <span>{children}</span>
    </span>
  );
}
