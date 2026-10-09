"use client";

import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { usePageAction } from "@/components/page-actions";
import { Button } from "@/components/ui/button";

/** A header action that goes somewhere (Edit): an outline link, also in the "⋯" menu on phones. */
export function PageActionLink({
  id,
  href,
  label,
  order,
  icon,
}: {
  id: string;
  href: string;
  label: string;
  order: number;
  icon: ReactNode;
}) {
  usePageAction(id, { label, order, href, icon });
  return (
    <Button asChild variant="outline">
      <Link href={href as Route}>
        {icon}
        {label}
      </Link>
    </Button>
  );
}
