"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition, type FormEvent } from "react";

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
import { PLAN_NAME_MAX, PLAN_NOTES_MAX } from "@/lib/plans";
import { ROUTINE_STATUSES, type RoutineStatus } from "@/lib/routines";
import { fromSelectValue, toSelectValue } from "@/lib/select-value";
import { updatePlanAction } from "@/server/plans/actions";

export type PlanDetails = {
  name: string;
  notes: string;
  caseId: string | null;
  status: RoutineStatus;
};

type SaveError =
  | "notFound"
  | "caseNotFound"
  | "needsEntries"
  | "hasArchivedRoutines"
  | "invalid"
  | "generic"
  | "nameRequired"
  | "nameTooLong"
  | "notesTooLong";

/** Name, status, case and notes of a plan. Saves with the button (the board saves on its own). */
export function PlanDetailsForm({
  planId,
  initial,
  cases,
}: {
  planId: string;
  /** What the server held when the page loaded. The form keeps its own state after that. */
  initial: PlanDetails;
  cases: { id: string; title: string }[];
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

  const dirty = JSON.stringify(values) !== JSON.stringify(saved);
  const nameBlank = values.name.trim() === "";
  const caseTitles = new Map(cases.map((item) => [item.id, item.title]));

  const change = (patch: Partial<PlanDetails>) => {
    setValues((previous) => ({ ...previous, ...patch }));
    setJustSaved(false);
  };

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (nameBlank) {
      setError("nameRequired");
      return;
    }
    setError(null);
    const submitted = values;
    startTransition(async () => {
      try {
        const result = await updatePlanAction({
          id: planId,
          name: submitted.name,
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

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 rounded-lg border p-4">
      <h2 className="text-base font-semibold">{t("title")}</h2>
      <div className="grid gap-4 md:grid-cols-[2fr_1fr_1fr]">
        <div className="grid gap-2">
          <Label htmlFor={`${id}-name`}>{t("name")}</Label>
          <Input
            id={`${id}-name`}
            value={values.name}
            maxLength={PLAN_NAME_MAX}
            autoComplete="off"
            required
            aria-invalid={error === "nameRequired"}
            onChange={(event) => change({ name: event.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${id}-status`}>{t("status")}</Label>
          <Select
            value={values.status}
            onValueChange={(next) => {
              // "" only comes from Radix's internal <select>, never from a choice.
              const status = ROUTINE_STATUSES.find((candidate) => candidate === next);
              if (status) change({ status });
            }}
          >
            <SelectTrigger id={`${id}-status`} className="w-full">
              <SelectValue>{tStatus(values.status)}</SelectValue>
            </SelectTrigger>
            <SelectContent position="popper">
              {ROUTINE_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {tStatus(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {cases.length > 0 ? (
          <div className="grid gap-2">
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
          </div>
        ) : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-notes`}>{t("notes")}</Label>
        <Textarea
          id={`${id}-notes`}
          value={values.notes}
          maxLength={PLAN_NOTES_MAX}
          rows={3}
          aria-describedby={`${id}-notes-hint`}
          onChange={(event) => change({ notes: event.target.value })}
        />
        <p id={`${id}-notes-hint`} className="text-muted-foreground text-xs">
          {t("notesHint")}
        </p>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>
            {tErrors(error, { max: error === "nameTooLong" ? PLAN_NAME_MAX : PLAN_NOTES_MAX })}
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || !dirty}>
          {pending ? t("saving") : t("save")}
        </Button>
        <p role="status" className="text-muted-foreground text-xs">
          {dirty ? t("unsaved") : justSaved ? t("saved") : ""}
        </p>
      </div>
    </form>
  );
}
