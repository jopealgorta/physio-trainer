"use client";

import { ArchiveIcon, ArchiveRestoreIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { usePageAction } from "@/components/page-actions";
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
} from "@/components/ui/alert-dialog";
import { setCustomerArchivedAction } from "@/server/customers/actions";

/**
 * Archive (after a confirmation: it revokes the customer's links) or Restore, from the page's
 * "⋯" menu at every size (inside `PageActions`). Renders the confirmation and what went wrong.
 */
export function CustomerArchiveAction({
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
  const [confirming, setConfirming] = useState(false);
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

  const { onCloseAutoFocus } = usePageAction("archive", {
    label: archived ? t("restore") : t("archive"),
    order: 90,
    menuOnly: true,
    icon: archived ? <ArchiveRestoreIcon aria-hidden /> : <ArchiveIcon aria-hidden />,
    pending,
    opensDialog: !archived,
    onSelect: () => (archived ? setArchived(false) : setConfirming(true)),
  });

  return (
    <>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
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
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}
