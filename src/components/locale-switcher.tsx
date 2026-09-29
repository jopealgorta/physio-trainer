"use client";

import { useLocale, useTranslations } from "next-intl";
import { useOptimistic, useTransition } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Language picker for signed-out pages. Signed-in physios change language in Settings. */
export function LocaleSwitcher({
  options,
  setLocale,
  className,
}: {
  options: { value: string; label: string }[];
  setLocale: (locale: string) => Promise<{ ok: boolean }>;
  className?: string;
}) {
  const t = useTranslations("LocaleSwitcher");
  const locale = useLocale();
  const [shown, setShown] = useOptimistic<string>(locale);
  const [pending, startTransition] = useTransition();

  return (
    <Select
      value={shown}
      onValueChange={(next) => {
        if (pending || !next) return;
        startTransition(async () => {
          setShown(next);
          try {
            await setLocale(next);
          } catch {
            // Offline or a stale deploy: the optimistic value reverts; keep the page usable.
          }
        });
      }}
    >
      {/* Busy, not disabled: disabling a focused control drops keyboard focus to <body>. */}
      <SelectTrigger
        aria-label={t("label")}
        aria-busy={pending}
        className={cn("aria-busy:opacity-70", className)}
      >
        <SelectValue>{options.find((option) => option.value === shown)?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent position="popper">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
