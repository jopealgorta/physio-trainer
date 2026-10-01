"use client";

import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { startTransition, useActionState, useId, useState, type FormEvent } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PLAN_NAME_MAX } from "@/lib/plans";
import { ROUTINE_NAME_MAX } from "@/lib/routines";
import type { TemplateKind } from "@/lib/templates";
import { createTemplateAction, type TemplateFormState } from "@/server/templates/actions";

const initialState: TemplateFormState = { status: "idle" };

const NAME_MAX = { routine: ROUTINE_NAME_MAX, plan: PLAN_NAME_MAX } as const;
const NAME_ERRORS = ["nameRequired", "nameTooLong"] as const;
const FORM_ERRORS = ["notFound", "invalid"] as const;

/**
 * "New template" button and dialog. A successful create redirects to the editor from the server
 * action, so the dialog never sees a "saved" state.
 */
export function NewTemplateDialog({ kind }: { kind: TemplateKind }) {
  const t = useTranslations("Templates.new");
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">
          <PlusIcon aria-hidden /> {t(`button.${kind}`)}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(`title.${kind}`)}</DialogTitle>
        </DialogHeader>
        <NewTemplateForm kind={kind} />
      </DialogContent>
    </Dialog>
  );
}

function NewTemplateForm({ kind }: { kind: TemplateKind }) {
  const t = useTranslations("Templates.new");
  const tErrors = useTranslations("Templates.errors");
  const [state, formAction, pending] = useActionState(createTemplateAction, initialState);
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
      <div className="grid gap-2">
        <Label htmlFor={`${id}-name`}>{t("name")}</Label>
        <Input
          id={`${id}-name`}
          name="name"
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
          {pending ? t("creating") : t("create")}
        </Button>
      </DialogFooter>
    </form>
  );
}
