"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition, type FormEvent } from "react";

import { Field, FormFooter } from "@/components/form-layout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PLAN_NOTES_MAX } from "@/lib/plans";
import { ROUTINE_STATUSES, type RoutineStatus } from "@/lib/routines";
import { fromSelectValue, toSelectValue } from "@/lib/select-value";
import { TEMPLATE_STATUSES } from "@/lib/templates";
import { updatePlanAction } from "@/server/plans/actions";

/** The plan's details; its name is the page title (`PlanTitle`), renamed on its own. */
export type PlanDetails = {
  notes: string;
  caseId: string | null;
  status: RoutineStatus;
};

/** Details as the server stores them (it trims the notes), for comparing. */
const normalized = ({ notes, caseId, status }: PlanDetails) =>
  JSON.stringify({ notes: notes.trim(), caseId, status });

type SaveError =
  | "notFound"
  | "caseNotFound"
  | "needsEntries"
  | "hasArchivedRoutines"
  | "templateNoDraft"
  | "invalid"
  | "generic"
  | "notesTooLong";

/**
 * Status, case and notes of a plan, then `children` (the board, which saves on its own), then
 * the pinned footer whose Save saves the details.
 */
export function PlanDetailsForm({
  planId,
  initial,
  cases,
  isTemplate = false,
  children,
}: {
  planId: string;
  /**
   * What the server holds. The form keeps its own state, and takes these again only when they
   * differ from what it last saved (a restored version, spec 15).
   */
  initial: PlanDetails;
  cases: { id: string; title: string }[];
  /** Templates are active or archived (no draft). */
  isTemplate?: boolean;
  children?: React.ReactNode;
}) {
  const t = useTranslations("Plans.board.details");
  const tErrors = useTranslations("Plans.board.errors");
  const tStatus = useTranslations("Routines.status");
  const id = useId();
  const [values, setValues] = useState<PlanDetails>(initial);
  const [saved, setSaved] = useState<PlanDetails>(initial);
  const [error, setError] = useState<SaveError | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const [server, setServer] = useState(initial);

  // The page re-renders with every board action and after this form's own save; only details
  // that changed elsewhere (a restore) replace what the form holds. Its own save comes back
  // trimmed, so compare the way the server stores them.
  if (normalized(initial) !== normalized(server)) {
    setServer(initial);
    if (normalized(initial) !== normalized(saved)) {
      setValues(initial);
      setSaved(initial);
      setError(null);
      setJustSaved(false);
    }
  }

  const dirty = normalized(values) !== normalized(saved);
  const statuses = isTemplate ? TEMPLATE_STATUSES : ROUTINE_STATUSES;
  const caseTitles = new Map(cases.map((item) => [item.id, item.title]));

  const change = (patch: Partial<PlanDetails>) => {
    setValues((previous) => ({ ...previous, ...patch }));
    setJustSaved(false);
  };

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const submitted = values;
    startTransition(async () => {
      try {
        const result = await updatePlanAction({
          id: planId,
          notes: submitted.notes,
          caseId: submitted.caseId,
          status: submitted.status,
        });
        if (result.ok) {
          setSaved(submitted);
          setJustSaved(true);
        } else {
          setError(result.error);
        }
      } catch {
        setError("generic");
      }
    });
  }

  const formId = `${id}-form`;

  return (
    <>
      <form id={formId} onSubmit={onSubmit} noValidate className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field>
            <Label htmlFor={`${id}-status`}>{t("status")}</Label>
            <Select
              value={values.status}
              onValueChange={(next) => {
                // "" only comes from Radix's internal <select>, never from a choice.
                const status = statuses.find((candidate) => candidate === next);
                if (status) change({ status });
              }}
            >
              <SelectTrigger id={`${id}-status`} className="w-full">
                <SelectValue>{tStatus(values.status)}</SelectValue>
              </SelectTrigger>
              <SelectContent position="popper">
                {statuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {tStatus(status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {cases.length > 0 ? (
            <Field>
              <Label htmlFor={`${id}-case`}>{t("case")}</Label>
              <Select
                value={toSelectValue(values.caseId ?? "")}
                onValueChange={(next) => {
                  if (next === "") return;
                  change({ caseId: fromSelectValue(next) || null });
                }}
              >
                <SelectTrigger id={`${id}-case`} className="w-full">
                  <SelectValue>
                    {values.caseId ? caseTitles.get(values.caseId) : t("noCase")}
                  </SelectValue>
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
            </Field>
          ) : null}
        </div>
        <Field>
          <Label htmlFor={`${id}-notes`}>{t("notes")}</Label>
          <Textarea
            id={`${id}-notes`}
            value={values.notes}
            maxLength={PLAN_NOTES_MAX}
            rows={2}
            aria-describedby={`${id}-notes-hint`}
            onChange={(event) => change({ notes: event.target.value })}
          />
          <p id={`${id}-notes-hint`} className="text-muted-foreground text-sm">
            {t("notesHint")}
          </p>
        </Field>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{tErrors(error, { max: PLAN_NOTES_MAX })}</AlertDescription>
          </Alert>
        ) : null}
      </form>

      {children}

      <FormFooter wide status={dirty ? t("unsaved") : justSaved ? t("saved") : null}>
        {/* Outside the form, so the board between them can hold forms of its own. */}
        <Button type="submit" form={formId} disabled={pending || !dirty}>
          {pending ? t("saving") : t("save")}
        </Button>
      </FormFooter>
    </>
  );
}
