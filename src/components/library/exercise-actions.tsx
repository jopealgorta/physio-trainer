"use client";

import { ArchiveIcon, ArchiveRestoreIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { usePageAction } from "@/components/page-actions";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { deleteExerciseAction, setExerciseArchivedAction } from "@/server/library/actions";

/**
 * Archive (or Restore) and Delete for an exercise: rare, so they live in the page's "⋯" menu at
 * every size (inside `PageActions`). Renders the delete confirmation and what went wrong.
 */
export function ExerciseActions({
  id,
  name,
  archived,
}: {
  id: string;
  name: string;
  archived: boolean;
}) {
  const t = useTranslations("Library.detail");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<"notFound" | "inUse" | "unknown" | null>(null);

  function toggleArchived() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await setExerciseArchivedAction(id, !archived);
        if (result.ok) router.refresh();
        else setError(result.error);
      } catch {
        setError("unknown");
      }
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      try {
        // Redirects to /library on success, so only a failure comes back.
        const result = await deleteExerciseAction(id);
        if (result && !result.ok) setError(result.error);
      } catch {
        setError("unknown");
      }
    });
  }

  usePageAction("archive", {
    label: archived ? t("restore") : t("archive"),
    order: 90,
    menuOnly: true,
    icon: archived ? <ArchiveRestoreIcon aria-hidden /> : <ArchiveIcon aria-hidden />,
    pending,
    onSelect: toggleArchived,
  });
  const { onCloseAutoFocus } = usePageAction("delete", {
    label: t("delete"),
    order: 91,
    menuOnly: true,
    destructive: true,
    opensDialog: true,
    icon: <Trash2Icon aria-hidden />,
    disabled: pending,
    onSelect: () => setConfirming(true),
  });

  return (
    <>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteBody", { name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              {t("confirmDelete")}
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
