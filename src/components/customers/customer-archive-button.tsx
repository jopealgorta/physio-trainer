"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { setCustomerArchivedAction } from "@/server/customers/actions";

/** Archiving asks for confirmation (share links stop working); restoring is immediate. */
export function CustomerArchiveButton({
  id,
  name,
  archived,
}: {
  id: string;
  name: string;
  archived: boolean;
}) {
  const t = useTranslations("Customers.detail");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<"notFound" | "unknown" | null>(null);

  function setArchived(next: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await setCustomerArchivedAction(id, next);
        if (result.ok) router.refresh();
        else setError(result.error);
      } catch {
        setError("unknown");
      }
    });
  }

  return (
    <>
      {archived ? (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => setArchived(false)}
        >
          {t("restore")}
        </Button>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="outline" disabled={pending}>
              {t("archive")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("archiveTitle", { name })}</AlertDialogTitle>
              <AlertDialogDescription>{t("archiveBody")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={() => setArchived(true)}>
                {t("archiveConfirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {error ? (
        <Alert variant="destructive" className="basis-full">
          <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}
