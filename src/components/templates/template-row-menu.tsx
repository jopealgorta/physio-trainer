"use client";

import { MoreVerticalIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * What can be done to a template from its list row. "Assign to customer…" only appears when the
 * list can offer customers (`onAssign` given).
 */
export function TemplateRowMenu({
  name,
  onAssign,
  onDuplicate,
  disabled,
}: {
  name: string;
  onAssign?: () => void;
  onDuplicate: () => void;
  disabled?: boolean;
}) {
  const t = useTranslations("Templates.list");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("actions", { name })}
          disabled={disabled}
          className="shrink-0"
        >
          <MoreVerticalIcon aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {onAssign ? <DropdownMenuItem onSelect={onAssign}>{t("assign")}</DropdownMenuItem> : null}
        <DropdownMenuItem onSelect={onDuplicate}>{t("duplicate")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
