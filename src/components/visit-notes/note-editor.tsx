"use client";

import { useTranslations } from "next-intl";
import {
  startTransition,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fromSelectValue, toSelectValue } from "@/lib/select-value";
import { clearDraft, readDraft, writeDraft } from "@/lib/visit-note-draft";
import { draftKey, type NoteFields, SOAP_FIELDS, SOAP_MAX, sameFields } from "@/lib/visit-notes";
import type { VisitNoteField, VisitNoteFormState } from "@/server/visit-notes/schemas";

/** A note's editable values plus its id when editing. */
export type NoteFormValues = NoteFields & { id?: string };

const initialState: VisitNoteFormState = { status: "idle" };

const FORM_ERROR_CODES = [
  "soapRequired",
  "tooLong",
  "dateInvalid",
  "painOutOfRange",
  "invalid",
] as const;

type Props = {
  action: (state: VisitNoteFormState, formData: FormData) => Promise<VisitNoteFormState>;
  /** Owner of a new note; ignored when `defaults.id` is set. */
  customerId: string;
  /** The customer's cases, for the optional case link. */
  cases: { id: string; title: string }[];
  defaults: NoteFormValues;
  /** Called once after each successful save (the sheet closes itself here). */
  onSaved?: () => void;
};

export function NoteEditor({ action, customerId, cases, defaults, onSaved }: Props) {
  const t = useTranslations("VisitNotes");
  const [state, formAction, pending] = useActionState(action, initialState);
  const id = useId();
  const editing = defaults.id !== undefined;
  const key = draftKey(customerId, defaults.id ?? null);
  const saved: NoteFields = {
    visitedOn: defaults.visitedOn,
    caseId: defaults.caseId,
    subjective: defaults.subjective,
    objective: defaults.objective,
    assessment: defaults.assessment,
    plan: defaults.plan,
    pain: defaults.pain,
  };

  const [{ fields, restored }, setForm] = useState(() => {
    const draft = readDraft(key);
    if (draft && !sameFields(draft, saved)) {
      const caseId = cases.some((item) => item.id === draft.caseId) ? draft.caseId : "";
      return { fields: { ...draft, caseId }, restored: true };
    }
    return { fields: saved, restored: false };
  });
  const formRef = useRef<HTMLFormElement>(null);
  const savedRef = useRef(false);

  const setField = (field: keyof NoteFields, value: string) =>
    setForm((current) => ({ ...current, fields: { ...current.fields, [field]: value } }));

  // Autosave on every change so an accidental close loses nothing; an unchanged form keeps no draft.
  useEffect(() => {
    if (savedRef.current) return;
    if (sameFields(fields, saved)) clearDraft(key);
    else writeDraft(key, fields);
    // `saved` is derived from `defaults`, which only changes when the editor is remounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, key]);

  useEffect(() => {
    if (state.status !== "saved") return;
    savedRef.current = true;
    clearDraft(key);
    onSaved?.();
    // Only a new result should notify; a re-render with a new callback identity must not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const errors = state.status === "error" ? state.fieldErrors : {};
  const errorId = (field: VisitNoteField) => `${id}-${field}-error`;
  const errorText = (field: VisitNoteField) => {
    const code = errors[field];
    if (!code) return null;
    const known = FORM_ERROR_CODES.find((candidate) => candidate === code) ?? "invalid";
    return (
      <p id={errorId(field)} className="text-destructive text-sm">
        {t(`errors.${known}`, { max: SOAP_MAX })}
      </p>
    );
  };
  const invalid = (field: VisitNoteField) => errors[field] !== undefined;
  const describedBy = (...ids: (string | undefined)[]) =>
    ids.filter(Boolean).join(" ") || undefined;

  // React resets a form after its `action` resolves; dispatching from onSubmit skips that reset
  // (`action` stays for submits before hydration).
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  function discardDraft() {
    clearDraft(key);
    setForm({ fields: saved, restored: false });
  }

  const soapError = invalid("soap") ? errorId("soap") : undefined;
  const selectedCase = cases.find((item) => item.id === fields.caseId);

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={onSubmit}
      onKeyDown={onKeyDown}
      noValidate
      className="grid gap-6"
    >
      {editing ? (
        <input type="hidden" name="id" value={defaults.id} />
      ) : (
        <input type="hidden" name="customerId" value={customerId} />
      )}

      {restored ? (
        <Alert role="status">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>{t("draftRestored")}</span>
            <Button type="button" variant="outline" size="sm" onClick={discardDraft}>
              {t("discardDraft")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor={`${id}-visitedOn`}>{t("visitedOn")}</Label>
          <Input
            id={`${id}-visitedOn`}
            name="visitedOn"
            type="date"
            value={fields.visitedOn}
            onChange={(event) => setField("visitedOn", event.target.value)}
            aria-invalid={invalid("visitedOn")}
            aria-describedby={describedBy(invalid("visitedOn") ? errorId("visitedOn") : undefined)}
          />
          {errorText("visitedOn")}
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor={`${id}-pain`}>{t("pain")}</Label>
          <Input
            id={`${id}-pain`}
            name="pain"
            inputMode="numeric"
            autoComplete="off"
            value={fields.pain}
            onChange={(event) => setField("pain", event.target.value)}
            aria-invalid={invalid("pain")}
            aria-describedby={describedBy(
              `${id}-pain-hint`,
              invalid("pain") ? errorId("pain") : undefined,
            )}
          />
          <p id={`${id}-pain-hint`} className="text-muted-foreground text-sm">
            {t("painHint")}
          </p>
          {errorText("pain")}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${id}-case`}>{t("case")}</Label>
        <input type="hidden" name="caseId" value={fields.caseId} />
        <Select
          value={toSelectValue(fields.caseId)}
          onValueChange={(next) => {
            // "" only comes from Radix's internal <select>, never from a choice.
            if (next === "") return;
            setField("caseId", fromSelectValue(next));
          }}
        >
          <SelectTrigger
            id={`${id}-case`}
            className="w-full"
            aria-invalid={invalid("caseId")}
            aria-describedby={describedBy(invalid("caseId") ? errorId("caseId") : undefined)}
          >
            <SelectValue>{selectedCase ? selectedCase.title : t("caseNone")}</SelectValue>
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value={toSelectValue("")}>{t("caseNone")}</SelectItem>
            {cases.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errorText("caseId")}
      </div>

      {SOAP_FIELDS.map((field) => (
        <div key={field} className="grid gap-2">
          <Label htmlFor={`${id}-${field}`}>{t(`soap.${field}.label`)}</Label>
          <Textarea
            id={`${id}-${field}`}
            name={field}
            rows={3}
            value={fields[field]}
            onChange={(event) => setField(field, event.target.value)}
            placeholder={t(`soap.${field}.hint`)}
            maxLength={SOAP_MAX}
            aria-invalid={invalid(field) || invalid("soap")}
            aria-describedby={describedBy(invalid(field) ? errorId(field) : undefined, soapError)}
          />
          {errorText(field)}
        </div>
      ))}
      {errorText("soap")}

      {state.status === "error" && state.formError ? (
        <Alert variant="destructive">
          <AlertDescription>{t(`errors.${state.formError}`)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t(editing ? "save" : "create")}
        </Button>
        <p className="text-muted-foreground text-sm">{t("saveHint")}</p>
      </div>
    </form>
  );
}
