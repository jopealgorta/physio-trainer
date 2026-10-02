"use client";

import { DownloadIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** "Export" dropdown (spec 14): PDF or Excel of a routine, plan or customer; tracking boxes optional. */
export function ExportMenu({
  target,
}: {
  target: { kind: "routines" | "plans" | "customers"; id: string };
}) {
  const t = useTranslations("Export.menu");
  const [tracking, setTracking] = useState(true);
  const base = `/api/export/${target.kind}/${target.id}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline">
          <DownloadIcon aria-hidden />
          {t("trigger")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuItem asChild>
          <a href={`${base}?format=pdf${tracking ? "" : "&tracking=0"}`} download>
            {t("pdf")}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={`${base}?format=xlsx`} download>
            {t("xlsx")}
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={tracking}
          onCheckedChange={(value) => setTracking(value === true)}
          onSelect={(event) => event.preventDefault()}
        >
          {t("tracking")}
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
