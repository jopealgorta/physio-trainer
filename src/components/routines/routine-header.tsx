"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, type ReactNode } from "react";

import { EditableTitle } from "@/components/editable-title";
import { PageActions, PageActionsMenu, PageNotices } from "@/components/page-actions";
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
  /** The way back (a link). */
  back?: ReactNode;
  /** Export and Share, at the end of the back link's row. */
  actions?: ReactNode;
  /** The template row: "From template" and Save as template, or a template's own actions. */
  secondary?: ReactNode;
  /** The phase bar. */
  phase?: ReactNode;
};

/**
 * Name, status, case, frequency and notes, and the page's controls around them (Save is in the
 * editor's pinned footer). From `sm` up: back and Export/Share; the template row; the phase; the
 * title with History. On a phone the controls give way to a "⋯" menu (see `PageActions`) in one
 * compact row: back and the menu; then the title and the phase. One flex container with `order`
 * does both.
 */
export function RoutineHeader({
  values,
  errors,
  onChange,
  isTemplate,
  customerId,
  customerName,
  cases,
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
  /** Bumped by the editor when a save is refused, to move focus to the first invalid field. */
  focusToken: number;
  /** More controls (the History button), beside the title from `sm` up. */
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

  return (
    <PageActions>
      <div ref={root} className="grid gap-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-6">
          {top.back ? <div className="order-1 min-w-0 flex-1">{top.back}</div> : null}
          {top.actions ? (
            <div className="hidden flex-wrap items-center gap-2 sm:order-2 sm:flex">
              {top.actions}
            </div>
          ) : null}
          <PageActionsMenu className="order-3" />
          <PageNotices className="order-4 basis-full" />
          {top.secondary ? (
            <div className="hidden basis-full flex-wrap items-center gap-3 sm:order-3 sm:flex">
              {top.secondary}
            </div>
          ) : null}
          {top.phase ? <div className="order-7 basis-full sm:order-4">{top.phase}</div> : null}
          <div className="order-5 grid min-w-0 basis-full gap-1 sm:order-5 sm:grow sm:basis-64 sm:self-start">
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
            />
            {isTemplate ? (
              <div>
                <TemplateBadge />
              </div>
            ) : customerId !== null && customerName !== null ? (
              <p className="text-muted-foreground text-sm">
                {t("customer")}:{" "}
                <Link
                  href={`/customers/${customerId}`}
                  className="text-foreground rounded-sm hover:underline focus-visible:underline"
                >
                  {customerName}
                </Link>
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="hidden sm:order-6 sm:block sm:self-start">{actions}</div>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid content-start gap-1.5">
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
            <div className="grid content-start gap-1.5">
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

          <div className="grid content-start gap-1.5">
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

          <div className="grid content-start gap-1.5">
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

        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-notes`}>{t("notes")}</Label>
          <Textarea
            id={`${id}-notes`}
            rows={2}
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
