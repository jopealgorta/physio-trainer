"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { closeCaseAction } from "@/server/customers/actions";

type CloseError = "notFound" | "notOpen" | "closedBeforeOpened" | "dateInvalid" | "unknown";

/**
 * Close-case button and confirmation dialog. `today` is the physio's calendar day, computed on
 * the server in their time zone; the client never guesses it.
 */
export function CloseCaseDialog({ caseId, today }: { caseId: string; today: string }) {
  const t = useTranslations("Cases");
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<CloseError | null>(null);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) setError(null);
  }

  function submit(formData: FormData) {
    const raw = formData.get("closedOn");
    const closedOn = typeof raw === "string" && raw !== "" ? raw : null;
    setError(null);
    startTransition(async () => {
      try {
        const result = await closeCaseAction(caseId, closedOn);
        if (result.ok) {
          setOpen(false);
          router.refresh();
        } else {
          setError(result.error);
        }
      } catch {
        setError("unknown");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          {t("close")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form action={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t("closeTitle")}</DialogTitle>
            <DialogDescription>{t("closeBody")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-closedOn`}>{t("closedOnLabel")}</Label>
            <Input
              id={`${id}-closedOn`}
              name="closedOn"
              type="date"
              defaultValue={today}
              aria-invalid={error === "closedBeforeOpened" || error === "dateInvalid"}
            />
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? t("closing") : t("closeConfirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
