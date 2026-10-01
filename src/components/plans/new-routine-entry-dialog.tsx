"use client";

import { useTranslations } from "next-intl";
import { startTransition, useActionState, useId, type FormEvent } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_ENTRIES_PER_DAY } from "@/lib/plans";
import { ROUTINE_NAME_MAX } from "@/lib/routines";
import { addNewRoutineEntryAction, type AddNewRoutineFormState } from "@/server/plans/actions";

const initialState: AddNewRoutineFormState = { status: "idle" };

const NAME_ERRORS = ["nameRequired", "nameTooLong"] as const;
const FORM_ERRORS = ["notFound", "customerNotFound", "caseNotFound", "dayFull", "invalid"] as const;

/**
 * "New routine" on a day: asks for a name, creates the draft, attaches it to the day and (from
 * the server action) redirects to the routine editor, which links back to the plan.
 */
export function NewRoutineEntryDialog({
  open,
  onOpenChange,
  planId,
  weekday,
  dayName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string;
  weekday: number;
  dayName: string;
}) {
  const t = useTranslations("Plans.board.newRoutine");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { day: dayName })}</DialogTitle>
        </DialogHeader>
        {/* Remounts on every open: a fresh form state and an empty name. */}
        {open ? <NewRoutineForm planId={planId} weekday={weekday} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function NewRoutineForm({ planId, weekday }: { planId: string; weekday: number }) {
  const t = useTranslations("Plans.board.newRoutine");
  const tErrors = useTranslations("Plans.board.errors");
  const [state, formAction, pending] = useActionState(addNewRoutineEntryAction, initialState);
  const id = useId();

  const nameCode =
    state.status === "error" && state.fieldErrors.name
      ? (NAME_ERRORS.find((code) => code === state.fieldErrors.name) ?? "nameRequired")
      : null;
  const formCode =
    state.status === "error" && state.formError
      ? (FORM_ERRORS.find((code) => code === state.formError) ?? "invalid")
      : null;
  const nameErrorId = `${id}-name-error`;

  // React resets a form after its `action` resolves, wiping typed values. Dispatching from
  // onSubmit skips that reset; `action` stays for submits before hydration.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-4">
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="weekday" value={weekday} />
      <div className="grid gap-2">
        <Label htmlFor={`${id}-name`}>{t("name")}</Label>
        <Input
          id={`${id}-name`}
          name="name"
          maxLength={ROUTINE_NAME_MAX}
          autoComplete="off"
          required
          aria-invalid={nameCode !== null}
          aria-describedby={nameCode ? nameErrorId : `${id}-hint`}
        />
        {nameCode ? (
          <p id={nameErrorId} className="text-destructive text-sm">
            {tErrors(nameCode, { max: ROUTINE_NAME_MAX })}
          </p>
        ) : (
          <p id={`${id}-hint`} className="text-muted-foreground text-xs">
            {t("hint")}
          </p>
        )}
      </div>

      {formCode ? (
        <Alert variant="destructive">
          <AlertDescription>{tErrors(formCode, { max: MAX_ENTRIES_PER_DAY })}</AlertDescription>
        </Alert>
      ) : null}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            {t("cancel")}
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? t("creating") : t("create")}
        </Button>
      </DialogFooter>
    </form>
  );
}
