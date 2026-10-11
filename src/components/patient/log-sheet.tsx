"use client";

import { XIcon } from "lucide-react";
import { useLocale } from "next-intl";
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

/**
 * The bottom sheet the routine's "Mark as done" log opens in (an exercise's log is inline since
 * spec 20): a title, an optional description, a close button and a scrolling body.
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

/**
 * Logs as the page loaded them, overridden by what was saved here since (null: cleared), so the
 * button follows at once instead of waiting for the refreshed page. Pass `source` (the loaded
 * data) to drop what was remembered once a fresh one arrives: the server then wins, e.g. when it
 * deleted a session that was left empty.
 */
export function useSavedLogs<T>(loaded: (date: string) => T | null, source?: unknown) {
  const [saved, setSaved] = useState<Record<string, T | null>>({});
  const [seen, setSeen] = useState(source);
  if (seen !== source) {
    setSeen(source);
    setSaved({});
  }
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
