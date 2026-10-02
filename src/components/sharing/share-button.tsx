"use client";

import { Share2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import {
  loadShareAction,
  renewShareLinkAction,
  revokeShareLinkAction,
  setSharePinAction,
  updateShareLinkAction,
} from "@/server/sharing/actions";
import type { Result, ShareError, ShareRef, ShareState } from "@/server/sharing/schemas";

import { ShareLinkPanel, type PanelError } from "./share-link-panel";

/**
 * "Share" button and its popover (spec 10): the button names what it shares ("Share all active",
 * "Share routine", "Share plan"); the popover has the link, WhatsApp/email, QR, expiry, PIN, revoke and
 * regenerate. The link is created the first time a target is opened; all state lives on the server.
 */
export function ShareButton({
  target,
  variant = "outline",
}: {
  target: ShareRef;
  variant?: "outline" | "secondary";
}) {
  const t = useTranslations("Sharing");
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ShareState | null>(null);
  const [error, setError] = useState<PanelError | null>(null);
  const [pin, setPin] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** Runs an action, adopts its state, or shows why it failed. */
  function run<T>(
    call: () => Promise<Result<T, ShareError>>,
    adopt: (data: T) => ShareState,
    afterOk?: (data: T) => void,
  ) {
    startTransition(async () => {
      try {
        const result = await call();
        if (result.ok) {
          setState(adopt(result.data));
          setError(null);
          afterOk?.(result.data);
        } else {
          setError(result.error);
        }
      } catch {
        setError("generic");
      }
    });
  }
  const runState = (call: () => Promise<Result<ShareState, ShareError>>, keepPin = false) =>
    run(
      call,
      (data) => data,
      () => (keepPin ? undefined : setPin(null)),
    );

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setError(null);
    setPin(null);
    runState(() => loadShareAction(target));
  }

  const link = state?.link;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant={variant}>
          <Share2Icon aria-hidden />
          {t(`trigger.${target.target}`)}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="gap-4 p-4 text-sm sm:max-h-(--radix-popover-content-available-height) sm:w-96 sm:overflow-y-auto"
      >
        <div className="grid gap-1">
          <PopoverTitle className="text-base font-semibold">
            {t(`title.${target.target}`)}
          </PopoverTitle>
          <p className="text-muted-foreground text-xs">{t(`description.${target.target}`)}</p>
        </div>
        {state?.link ? (
          <ShareLinkPanel
            state={state}
            error={error}
            actions={{
              busy: pending,
              pin,
              saveSlug: (slug) =>
                runState(() => updateShareLinkAction({ id: link!.id, slug }), true),
              saveExpiry: (expiresOn) =>
                runState(() => updateShareLinkAction({ id: link!.id, expiresOn }), true),
              setPin: (enabled) =>
                run(
                  () => setSharePinAction({ id: link!.id, enabled }),
                  (data) => data.state,
                  (data) => setPin(data.pin),
                ),
              regenerate: () => runState(() => renewShareLinkAction(target)),
              revoke: () => runState(() => revokeShareLinkAction(link!.id)),
              createNew: () => runState(() => renewShareLinkAction(target)),
            }}
          />
        ) : error ? (
          <p role="alert" className="text-destructive text-sm">
            {t(`errors.${error}`)}
          </p>
        ) : (
          <p role="status" className="text-muted-foreground text-sm">
            {t("loading")}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
