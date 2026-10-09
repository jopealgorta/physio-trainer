"use client";

import { LayersIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { startTransition, useActionState, useId, useState, type FormEvent } from "react";

import { usePageAction } from "@/components/page-actions";
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
import { NAME_MAX, type TemplateKind } from "@/lib/templates";
import { saveAsTemplateAction, type TemplateFormState } from "@/server/templates/actions";

const initialState: TemplateFormState = { status: "idle" };

const NAME_ERRORS = ["nameRequired", "nameTooLong"] as const;
const FORM_ERRORS = ["notFound", "alreadyTemplate", "invalid"] as const;

/**
 * "Save as template…" on a customer's routine or plan. The copy has no customer or case; notes
 * and labels come along as they are, so the dialog asks the physio to review them.
 */
export function SaveAsTemplateDialog({
  kind,
  sourceId,
  defaultName,
}: {
  kind: TemplateKind;
  sourceId: string;
  defaultName: string;
}) {
  const t = useTranslations("Templates.save");
  const [open, setOpen] = useState(false);
  const { onCloseAutoFocus } = usePageAction("saveAsTemplate", {
    label: t("button"),
    order: 10,
    icon: <LayersIcon aria-hidden />,
    opensDialog: true,
    onSelect: () => setOpen(true),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <LayersIcon aria-hidden /> {t("button")}
        </Button>
      </DialogTrigger>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("notesWarning")}</DialogDescription>
        </DialogHeader>
        <SaveAsTemplateForm kind={kind} sourceId={sourceId} defaultName={defaultName} />
      </DialogContent>
    </Dialog>
  );
}

function SaveAsTemplateForm({
  kind,
  sourceId,
  defaultName,
}: {
  kind: TemplateKind;
  sourceId: string;
  defaultName: string;
}) {
  const t = useTranslations("Templates.save");
  const tErrors = useTranslations("Templates.errors");
  const [state, formAction, pending] = useActionState(saveAsTemplateAction, initialState);
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
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="sourceId" value={sourceId} />
      <div className="grid gap-2">
        <Label htmlFor={`${id}-name`}>{t("name")}</Label>
        <Input
          id={`${id}-name`}
          name="name"
          defaultValue={defaultName}
          maxLength={NAME_MAX[kind]}
          autoComplete="off"
          required
          aria-invalid={nameCode !== null}
          aria-describedby={nameCode ? nameErrorId : undefined}
        />
        {nameCode ? (
          <p id={nameErrorId} className="text-destructive text-sm">
            {tErrors(nameCode, { max: NAME_MAX[kind] })}
          </p>
        ) : null}
      </div>

      {formCode ? (
        <Alert variant="destructive">
          <AlertDescription>{tErrors(formCode)}</AlertDescription>
        </Alert>
      ) : null}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            {t("cancel")}
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? t("submitting") : t("submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
