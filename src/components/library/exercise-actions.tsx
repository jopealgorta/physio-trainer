"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { deleteExerciseAction, setExerciseArchivedAction } from "@/server/library/actions";

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
  const [error, setError] = useState<"notFound" | "unknown" | null>(null);

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

  return (
    <>
      <Button type="button" variant="outline" disabled={pending} onClick={toggleArchived}>
        {archived ? t("restore") : t("archive")}
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            className="text-destructive hover:text-destructive"
          >
            {t("delete")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
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
        <Alert variant="destructive" className="basis-full">
          <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}
