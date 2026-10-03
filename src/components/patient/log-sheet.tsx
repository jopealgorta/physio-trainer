"use client";

import { XIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

/** A day the patient may still log (spec 13): today or yesterday in the physio's time zone. */
export type LoggableDay = { date: string; relative: "today" | "yesterday" };

/**
 * The bottom sheet both patient logs open in (the routine's "Mark as done" and an exercise's
 * "Log"): a title, an optional description, a close button and a scrolling body.
 */
export function LogSheet({
  open,
  onOpenChange,
  title,
  description,
  closeLabel,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  closeLabel: string;
  children: ReactNode;
}) {
  const locale = useLocale();
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        // The sheet is portalled out of the patient page, so it carries the page's branding
        // scope (the physio's accent) and the customer's language itself.
        data-brand="patient"
        lang={locale}
        // Without a description, the title says it all.
        {...(description === undefined ? { "aria-describedby": undefined } : {})}
        className="mx-auto max-h-[90dvh] max-w-2xl rounded-t-2xl text-sm"
      >
        <DrawerHeader className="relative pr-14">
          <DrawerTitle className="text-lg wrap-anywhere">{title}</DrawerTitle>
          {description !== undefined ? (
            <DrawerDescription className="text-sm wrap-anywhere">{description}</DrawerDescription>
          ) : null}
          <DrawerClose asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-3 right-3 size-10"
              aria-label={closeLabel}
            >
              <XIcon aria-hidden />
            </Button>
          </DrawerClose>
        </DrawerHeader>
        {/* The drawer itself cannot scroll (vaul owns its gestures); this inner box does. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}

/** Today / Yesterday, when a log can be for either (single routines). Nothing for one day. */
export function DayToggle({
  days,
  value,
  onChange,
  name = "day",
}: {
  days: LoggableDay[];
  value: string;
  onChange: (date: string) => void;
  /** The radios' group: unique per page when several toggles can show at once outside a form. */
  name?: string;
}) {
  const t = useTranslations("Patient.logging.day");
  if (days.length < 2) return null;
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">{t("label")}</legend>
      <div className="grid grid-cols-2 gap-2">
        {days.map((option) => (
          <label
            key={option.date}
            className={cn(
              "has-focus-visible:ring-ring/50 flex h-12 cursor-pointer items-center justify-center rounded-lg border text-base font-medium has-focus-visible:ring-[3px]",
              option.date === value
                ? "bg-primary text-primary-foreground border-transparent"
                : "bg-background hover:bg-muted",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.date}
              checked={option.date === value}
              onChange={() => onChange(option.date)}
              className="sr-only"
            />
            {t(option.relative)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * The day a log sheet is for: the shown day when it can be logged, else the latest loggable one.
 * `reset` goes back to it (on opening the sheet); `day` is undefined only when nothing can be logged.
 */
export function useLogDay(days: LoggableDay[], shownDate: string) {
  const initial = () =>
    days.find((day) => day.date === shownDate)?.date ?? days.at(-1)?.date ?? shownDate;
  const [selected, setSelected] = useState(initial);
  return {
    day: days.find((day) => day.date === selected) ?? days[0],
    select: setSelected,
    reset: () => setSelected(initial()),
  };
}

/**
 * Logs as the page loaded them, overridden by what was saved here since (null: cleared), so the
 * button follows at once instead of waiting for the refreshed page.
 */
export function useSavedLogs<T>(loaded: (date: string) => T | null) {
  const [saved, setSaved] = useState<Record<string, T | null>>({});
  return {
    logFor: (date: string): T | null =>
      Object.hasOwn(saved, date) ? (saved[date] ?? null) : loaded(date),
    remember: (date: string, log: T | null) => setSaved((current) => ({ ...current, [date]: log })),
  };
}

type ActionResult<T, E extends string> = { ok: true; data: T } | { ok: false; error: E };

/**
 * Sends a log through its Server Action: pending state, the action's error (or "generic" when the
 * call itself fails), and `onSaved` with what was stored.
 */
export function useLogSubmit<T, E extends string>() {
  const [error, setError] = useState<E | "generic" | null>(null);
  const [pending, startTransition] = useTransition();
  const submit = (call: () => Promise<ActionResult<T, E>>, onSaved: (data: T) => void) =>
    startTransition(async () => {
      let result: ActionResult<T, E>;
      try {
        result = await call();
      } catch {
        setError("generic");
        return;
      }
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      onSaved(result.data);
    });
  return { error, pending, submit };
}
