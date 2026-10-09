"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, type ReactNode } from "react";

import { EditableTitle } from "@/components/editable-title";
import { PageActions } from "@/components/page-actions";
import { PageHeader } from "@/components/page-header";
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
import { TemplateBadge } from "@/components/templates/template-badge";
import { validateName, type HeaderErrors, type HeaderField } from "@/lib/routine-validation";
import {
  ROUTINE_NAME_MAX,
  ROUTINE_NOTES_MAX,
  ROUTINE_STATUSES,
  SESSIONS_PER_DAY,
  SESSIONS_PER_WEEK,
  type RoutineStatus,
} from "@/lib/routines";
import { fromSelectValue, toSelectValue } from "@/lib/select-value";
import { TEMPLATE_STATUSES } from "@/lib/templates";

/** The editable header fields, as the inputs hold them (numbers stay strings until save). */
export type HeaderValues = {
  name: string;
  notes: string;
  caseId: string | null;
  sessionsPerWeek: string;
  sessionsPerDay: string;
  status: RoutineStatus;
};

const RANGES = { sessionsPerWeek: SESSIONS_PER_WEEK, sessionsPerDay: SESSIONS_PER_DAY } as const;

/** The routine page's controls around the header (rendered by the page, placed here). */
export type HeaderSlots = {
  /** The way back. */
  back?: { href: string; label: string };
  /** Under the title: "From template". */
  meta?: ReactNode;
  /** Before History: Save as template, or a template's own actions. */
  templates?: ReactNode;
  /** After History: Export and Share. */
  actions?: ReactNode;
  /** The phase bar, under the header. */
  phase?: ReactNode;
};

/**
 * Name, status, case, frequency and notes, plus the Save button and its saved/unsaved state, and
 * the page's controls around them, in the page header every detail page has (`PageHeader`): the
 * way back; the title; templates, History, Export and Share (the "⋯" menu on phones); the save
 * state and Save, the main action, at every size. Then the phase and the fields.
 */
export function RoutineHeader({
  values,
  errors,
  onChange,
  isTemplate,
  customerId,
  customerName,
  cases,
  dirty,
  saving,
  saved,
  onSave,
  focusToken,
  actions,
  top = {},
}: {
  values: HeaderValues;
  errors: HeaderErrors;
  onChange: (patch: Partial<HeaderValues>) => void;
  /** Templates are active or archived and have no customer or case. */
  isTemplate: boolean;
  customerId: string | null;
  customerName: string | null;
  cases: { id: string; title: string }[];
  dirty: boolean;
  saving: boolean;
  /** The last save succeeded and nothing changed since. */
  saved: boolean;
  onSave: () => void;
  /** Bumped by the editor when a save is refused, to move focus to the first invalid field. */
  focusToken: number;
  /** The History button, between the template actions and Export. */
  actions?: ReactNode;
  top?: HeaderSlots;
}) {
  const t = useTranslations("Routines.editor");
  const tStatus = useTranslations("Routines.status");
  const id = useId();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusToken > 0) root.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusToken]);

  const errorId = (field: HeaderField) => `${id}-${field}-error`;
  const invalid = (field: HeaderField) => errors[field] !== undefined;
  const describedBy = (field: HeaderField, hint?: string) => {
    const ids = [hint, errors[field] ? errorId(field) : undefined].filter(Boolean);
    return ids.length > 0 ? ids.join(" ") : undefined;
  };
  const errorText = (field: HeaderField) => {
    const code = errors[field];
    if (!code) return null;
    const range = field === "sessionsPerWeek" || field === "sessionsPerDay" ? RANGES[field] : null;
    return (
      <p id={errorId(field)} role="alert" className="text-destructive text-sm">
        {t(`errors.${code}`, {
          max: field === "notes" ? ROUTINE_NOTES_MAX : (range?.max ?? ROUTINE_NAME_MAX),
          min: range?.min ?? 1,
        })}
      </p>
    );
  };

  const statuses = isTemplate ? TEMPLATE_STATUSES : ROUTINE_STATUSES;
  const caseTitles = new Map(cases.map((item) => [item.id, item.title]));
  const indicator = saving ? "" : dirty ? t("unsaved") : saved ? t("saved") : "";

  return (
    <PageActions>
      <div ref={root} className="grid gap-4">
        <PageHeader
          back={top.back}
          title={
            <EditableTitle
              value={values.name}
              label={t("name")}
              editLabel={t("rename")}
              validate={(name) => {
                const code = validateName(name);
                return code ? t(`errors.${code}`, { max: ROUTINE_NAME_MAX }) : null;
              }}
              // Renaming is an edit like any other: saved with the Save button.
              onConfirm={(name) => onChange({ name })}
              error={
                errors.name ? t(`errors.${errors.name}`, { max: ROUTINE_NAME_MAX, min: 1 }) : null
              }
              hint={isTemplate ? undefined : t("nameHint")}
              // Typing is already an edit: Save saves it even while the input is still open.
              onDraftChange={(name) => onChange({ name })}
              after={isTemplate ? <TemplateBadge /> : undefined}
            />
          }
          meta={
            !isTemplate && customerId !== null && customerName !== null ? (
              <>
                <p>
                  {t("customer")}:{" "}
                  <Link
                    href={`/customers/${customerId}`}
                    className="text-foreground rounded-sm hover:underline focus-visible:underline"
                  >
                    {customerName}
                  </Link>
                </p>
                {top.meta}
              </>
            ) : (
              top.meta
            )
          }
          actions={
            <>
              {top.templates}
              {actions}
              {top.actions}
            </>
          }
          primary={
            <div className="flex items-center gap-3">
              <p
                role="status"
                data-testid="save-status"
                className="text-muted-foreground text-xs sm:text-sm"
              >
                {indicator}
              </p>
              <Button type="button" onClick={onSave} disabled={!dirty || saving}>
                {saving ? t("saving") : t("save")}
              </Button>
            </div>
          }
        />
        {top.phase}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid content-start gap-2">
            <Label htmlFor={`${id}-status`}>{t("status")}</Label>
            <Select
              value={values.status}
              onValueChange={(next) => {
                // "" only comes from Radix's internal <select>, never from a choice (see select-value).
                const status = statuses.find((candidate) => candidate === next);
                if (status) onChange({ status });
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
          </div>

          {!isTemplate && cases.length > 0 ? (
            <div className="grid content-start gap-2">
              <Label htmlFor={`${id}-case`}>{t("case")}</Label>
              <Select
                value={toSelectValue(values.caseId ?? "")}
                onValueChange={(next) => {
                  if (next === "") return;
                  onChange({ caseId: fromSelectValue(next) || null });
                }}
              >
                <SelectTrigger id={`${id}-case`} className="w-full">
                  <SelectValue>
                    {values.caseId ? (caseTitles.get(values.caseId) ?? "") : t("noCase")}
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

          <div className="grid content-start gap-2">
            <Label htmlFor={`${id}-sessionsPerWeek`}>{t("sessionsPerWeek")}</Label>
            <Input
              id={`${id}-sessionsPerWeek`}
              inputMode="numeric"
              value={values.sessionsPerWeek}
              onChange={(event) => onChange({ sessionsPerWeek: event.target.value })}
              autoComplete="off"
              aria-invalid={invalid("sessionsPerWeek")}
              aria-describedby={describedBy("sessionsPerWeek")}
            />
            {errorText("sessionsPerWeek")}
          </div>

          <div className="grid content-start gap-2">
            <Label htmlFor={`${id}-sessionsPerDay`}>{t("sessionsPerDay")}</Label>
            <Input
              id={`${id}-sessionsPerDay`}
              inputMode="numeric"
              value={values.sessionsPerDay}
              onChange={(event) => onChange({ sessionsPerDay: event.target.value })}
              autoComplete="off"
              aria-invalid={invalid("sessionsPerDay")}
              aria-describedby={describedBy("sessionsPerDay")}
            />
            {errorText("sessionsPerDay")}
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor={`${id}-notes`}>{t("notes")}</Label>
          <Textarea
            id={`${id}-notes`}
            rows={3}
            value={values.notes}
            onChange={(event) => onChange({ notes: event.target.value })}
            aria-invalid={invalid("notes")}
            aria-describedby={describedBy("notes", `${id}-notes-hint`)}
          />
          <p id={`${id}-notes-hint`} className="text-muted-foreground text-sm">
            {t("notesHint")}
          </p>
          {errorText("notes")}
        </div>
      </div>
    </PageActions>
  );
}
