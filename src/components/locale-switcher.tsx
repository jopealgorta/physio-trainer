"use client";

import { useLocale, useTranslations } from "next-intl";
import { useOptimistic, useTransition } from "react";

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
    <select
      aria-label={t("label")}
      value={shown}
      // Busy, not disabled: disabling a focused control drops keyboard focus to <body>.
      aria-busy={pending}
      onChange={(event) => {
        if (pending) return;
        const next = event.target.value;
        startTransition(async () => {
          setShown(next);
          try {
            await setLocale(next);
          } catch {
            // Offline or a stale deploy: the optimistic value reverts; keep the page usable.
          }
        });
      }}
      className={cn(
        "border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border bg-transparent px-2 text-base outline-none focus-visible:ring-[3px] aria-busy:opacity-70 md:text-sm",
        className,
      )}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
