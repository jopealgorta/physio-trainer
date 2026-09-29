"use client";

import { useTranslations } from "next-intl";
import { startTransition, useActionState, useEffect, useId, type FormEvent } from "react";

import { BodyAreaPicker } from "@/components/body-areas/body-area-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BodyArea, BodySide } from "@/lib/body-areas";
import {
  CASE_NOTES_MAX,
  CASE_TITLE_MAX,
  DIAGNOSIS_MAX,
  GOALS_MAX,
  PRECAUTIONS_MAX,
} from "@/lib/customers";
import type { CaseField, CaseFieldErrors, CaseFormState } from "@/server/customers/schemas";

/** The editable fields of a case, all serialisable (dates as `YYYY-MM-DD`). */
export type CaseFormValues = {
  id?: string;
  title: string;
  diagnosis: string | null;
  bodyArea: BodyArea | null;
  side: BodySide | null;
  injuryOn: string | null;
  surgeryOn: string | null;
  precautions: string | null;
  goals: string | null;
  initialPain: number | null;
  notes: string | null;
  openedOn: string | null;
};

const initialState: CaseFormState = { status: "idle" };

const FORM_ERROR_CODES = [
  "nameRequired",
  "nameTooLong",
  "tooLong",
  "dateInvalid",
  "painOutOfRange",
  "bodyAreaInvalid",
  "sideNeedsArea",
  "openedAfterClosed",
  "invalid",
] as const;

const MAX_BY_FIELD: Record<CaseField, number> = {
  title: CASE_TITLE_MAX,
  diagnosis: DIAGNOSIS_MAX,
  bodyArea: 0,
  side: 0,
  injuryOn: 0,
  surgeryOn: 0,
  precautions: PRECAUTIONS_MAX,
  goals: GOALS_MAX,
  initialPain: 0,
  notes: CASE_NOTES_MAX,
  openedOn: 0,
};

export function CaseForm({
  action,
  customerId,
  defaults,
  onSaved,
}: {
  action: (state: CaseFormState, formData: FormData) => Promise<CaseFormState>;
  /** Owner of a new case; ignored when `defaults.id` is set. */
  customerId: string;
  defaults: CaseFormValues;
  /** Called once after each successful save (the sheet closes itself here). */
  onSaved?: () => void;
}) {
  const t = useTranslations("Cases");
  const [state, formAction, pending] = useActionState(action, initialState);
  const id = useId();
  const editing = defaults.id !== undefined;

  useEffect(() => {
    if (state.status === "saved") onSaved?.();
    // Only a new result should notify; a re-render with a new callback identity must not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const errors: CaseFieldErrors = state.status === "error" ? state.fieldErrors : {};

  const message = (field: CaseField) => {
    const code = errors[field];
    if (!code) return null;
    const known = FORM_ERROR_CODES.find((candidate) => candidate === code) ?? "invalid";
    return t(`errors.${known}`, { max: MAX_BY_FIELD[field] });
  };
  const errorId = (field: string) => `${id}-${field}-error`;
  const errorText = (field: CaseField) => {
    const text = message(field);
    return text ? (
      <p id={errorId(field)} className="text-destructive text-sm">
        {text}
      </p>
    ) : null;
  };
  const invalid = (field: CaseField) => errors[field] !== undefined;
  const describedBy = (field: CaseField, hint?: string) => {
    const ids = [hint, errors[field] ? errorId(field) : undefined].filter(Boolean);
    return ids.length > 0 ? ids.join(" ") : undefined;
  };

  // React resets a form after its `action` resolves, wiping typed values. Dispatching from
  // onSubmit skips that reset; `action` stays for submits before hydration.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-6">
      {editing ? (
        <input type="hidden" name="id" value={defaults.id} />
      ) : (
        <input type="hidden" name="customerId" value={customerId} />
      )}

      <div className="grid gap-2">
        <Label htmlFor={`${id}-title`}>{t("title")}</Label>
        <Input
          id={`${id}-title`}
          name="title"
          defaultValue={defaults.title}
          placeholder={t("titleHint")}
          maxLength={CASE_TITLE_MAX}
          autoComplete="off"
          required
          aria-invalid={invalid("title")}
          aria-describedby={describedBy("title")}
        />
        {errorText("title")}
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${id}-diagnosis`}>{t("diagnosis")}</Label>
        <Input
          id={`${id}-diagnosis`}
          name="diagnosis"
          defaultValue={defaults.diagnosis ?? ""}
          maxLength={DIAGNOSIS_MAX}
          autoComplete="off"
          aria-invalid={invalid("diagnosis")}
          aria-describedby={describedBy("diagnosis")}
        />
        {errorText("diagnosis")}
      </div>

      <div className="grid gap-2">
        <BodyAreaPicker
          mode="single"
          withSide
          name="bodyArea"
          sideName="side"
          label={t("bodyArea")}
          defaultValue={defaults.bodyArea ? { area: defaults.bodyArea, side: defaults.side } : null}
        />
        {errorText("bodyArea")}
        {errorText("side")}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor={`${id}-injuryOn`}>{t("injuryOn")}</Label>
          <Input
            id={`${id}-injuryOn`}
            name="injuryOn"
            type="date"
            defaultValue={defaults.injuryOn ?? ""}
            aria-invalid={invalid("injuryOn")}
            aria-describedby={describedBy("injuryOn")}
          />
          {errorText("injuryOn")}
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor={`${id}-surgeryOn`}>{t("surgeryOn")}</Label>
          <Input
            id={`${id}-surgeryOn`}
            name="surgeryOn"
            type="date"
            defaultValue={defaults.surgeryOn ?? ""}
            aria-invalid={invalid("surgeryOn")}
            aria-describedby={describedBy("surgeryOn")}
          />
          {errorText("surgeryOn")}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${id}-precautions`}>{t("precautions")}</Label>
        <Textarea
          id={`${id}-precautions`}
          name="precautions"
          rows={3}
          defaultValue={defaults.precautions ?? ""}
          maxLength={PRECAUTIONS_MAX}
          aria-invalid={invalid("precautions")}
          aria-describedby={describedBy("precautions", `${id}-precautions-hint`)}
        />
        <p id={`${id}-precautions-hint`} className="text-muted-foreground text-sm">
          {t("precautionsHint")}
        </p>
        {errorText("precautions")}
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${id}-goals`}>{t("goals")}</Label>
        <Textarea
          id={`${id}-goals`}
          name="goals"
          rows={3}
          defaultValue={defaults.goals ?? ""}
          maxLength={GOALS_MAX}
          aria-invalid={invalid("goals")}
          aria-describedby={describedBy("goals")}
        />
        {errorText("goals")}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor={`${id}-initialPain`}>{t("initialPain")}</Label>
          <Input
            id={`${id}-initialPain`}
            name="initialPain"
            inputMode="numeric"
            defaultValue={defaults.initialPain === null ? "" : String(defaults.initialPain)}
            autoComplete="off"
            aria-invalid={invalid("initialPain")}
            aria-describedby={describedBy("initialPain", `${id}-initialPain-hint`)}
          />
          <p id={`${id}-initialPain-hint`} className="text-muted-foreground text-sm">
            {t("initialPainHint")}
          </p>
          {errorText("initialPain")}
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor={`${id}-openedOn`}>{t("openedOn")}</Label>
          <Input
            id={`${id}-openedOn`}
            name="openedOn"
            type="date"
            defaultValue={defaults.openedOn ?? ""}
            aria-invalid={invalid("openedOn")}
            aria-describedby={describedBy("openedOn", editing ? undefined : `${id}-openedOn-hint`)}
          />
          {editing ? null : (
            <p id={`${id}-openedOn-hint`} className="text-muted-foreground text-sm">
              {t("openedOnHint")}
            </p>
          )}
          {errorText("openedOn")}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${id}-notes`}>{t("notes")}</Label>
        <Textarea
          id={`${id}-notes`}
          name="notes"
          rows={4}
          defaultValue={defaults.notes ?? ""}
          maxLength={CASE_NOTES_MAX}
          aria-invalid={invalid("notes")}
          aria-describedby={describedBy("notes")}
        />
        {errorText("notes")}
      </div>

      {state.status === "error" && state.formError ? (
        <Alert variant="destructive">
          <AlertDescription>{t(`errors.${state.formError}`)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t(editing ? "save" : "create")}
        </Button>
        {state.status === "saved" && !pending ? (
          <p role="status" className="text-muted-foreground text-sm">
            {t("saved")}
          </p>
        ) : null}
      </div>
    </form>
  );
}
