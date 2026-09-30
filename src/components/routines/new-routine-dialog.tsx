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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROUTINE_NAME_MAX } from "@/lib/routines";
import { fromSelectValue, toSelectValue } from "@/lib/select-value";
import { createRoutineAction, type CreateRoutineFormState } from "@/server/routines/actions";

const initialState: CreateRoutineFormState = { status: "idle" };

const NAME_ERRORS = ["nameRequired", "nameTooLong"] as const;
const FORM_ERRORS = ["customerNotFound", "caseNotFound", "invalid"] as const;

/**
 * "New routine" button and dialog. A successful create redirects to the editor from the server
 * action, so the dialog never sees a "saved" state.
 */
export function NewRoutineDialog({
  customerId,
  customerName,
  cases,
}: {
  customerId: string;
  customerName: string;
  cases: { id: string; title: string }[];
}) {
  const t = useTranslations("Routines.new");
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">
          <PlusIcon aria-hidden /> {t("button")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { name: customerName })}</DialogTitle>
        </DialogHeader>
        <NewRoutineForm customerId={customerId} cases={cases} />
      </DialogContent>
    </Dialog>
  );
}

function NewRoutineForm({
  customerId,
  cases,
}: {
  customerId: string;
  cases: { id: string; title: string }[];
}) {
  const t = useTranslations("Routines.new");
  const [state, formAction, pending] = useActionState(createRoutineAction, initialState);
  const [caseId, setCaseId] = useState("");
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

  const caseTitles = new Map(cases.map((item) => [item.id, item.title]));

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-4">
      <input type="hidden" name="customerId" value={customerId} />
      <div className="grid gap-2">
        <Label htmlFor={`${id}-name`}>{t("name")}</Label>
        <Input
          id={`${id}-name`}
          name="name"
          maxLength={ROUTINE_NAME_MAX}
          autoComplete="off"
          required
          aria-invalid={nameCode !== null}
          aria-describedby={nameCode ? nameErrorId : undefined}
        />
        {nameCode ? (
          <p id={nameErrorId} className="text-destructive text-sm">
            {t(`errors.${nameCode}`, { max: ROUTINE_NAME_MAX })}
          </p>
        ) : null}
      </div>

      {cases.length > 0 ? (
        <div className="grid gap-2">
          <Label htmlFor={`${id}-case`}>{t("case")}</Label>
          <input type="hidden" name="caseId" value={caseId} />
          <Select
            value={toSelectValue(caseId)}
            onValueChange={(next) => {
              // "" only comes from Radix's internal <select>, never from a choice (see select-value).
              if (next === "") return;
              setCaseId(fromSelectValue(next));
            }}
          >
            <SelectTrigger id={`${id}-case`} className="w-full">
              <SelectValue>{caseId ? caseTitles.get(caseId) : t("noCase")}</SelectValue>
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value={toSelectValue("")}>{t("noCase")}</SelectItem>
              {cases.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {formCode ? (
        <Alert variant="destructive">
          <AlertDescription>{t(`errors.${formCode}`)}</AlertDescription>
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
