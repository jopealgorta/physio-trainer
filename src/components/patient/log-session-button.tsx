"use client";

import { CircleCheckIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useActionState, useId, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { LOG_COMMENT_MAX, parsePain } from "@/lib/session-logs";
import { cn } from "@/lib/utils";
import { logSessionAction, type LogActionResult } from "@/server/patient/actions";
import type { PatientLog } from "@/server/patient/log-session";

import { PainScale } from "./pain-scale";

export type LoggableDay = { date: string; relative: "today" | "yesterday" };

type Props = {
  /** The link's code: the only thing that identifies who is logging. */
  code: string;
  routineId: string;
  entryId: string | null;
  routineName: string;
  /** The days this routine can still be logged on (today and/or yesterday), oldest first. */
  days: LoggableDay[];
  /** The logs already saved for this routine and plan entry (any days). */
  logs: PatientLog[];
  /** The day this card stands for: the state shown on the button. */
  shownDate: string;
  /** Open the sheet straight away (the workout's finish screen). */
  defaultOpen?: boolean;
};

type FormState = { status: "idle" } | { status: "error"; error: keyof ErrorKeys };
type ErrorKeys = Record<Exclude<LogActionResult, { ok: true }>["error"] | "generic", true>;

/**
 * "Mark as done" for one routine card (spec 13): done state with Edit, and a bottom sheet with the
 * pain rating and a comment. Saving goes through the link-scoped Server Action; the page refreshes
 * so the week strip follows.
 */
export function LogSessionButton({
  code,
  routineId,
  entryId,
  routineName,
  days,
  logs,
  shownDate,
  defaultOpen = false,
}: Props) {
  const t = useTranslations("Patient.logging");
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  // Saved here first so the button turns to "Done" before the refreshed page arrives.
  const [saved, setSaved] = useState<PatientLog[]>([]);
  const [selected, setSelected] = useState(
    days.find((day) => day.date === shownDate)?.date ?? days.at(-1)?.date ?? shownDate,
  );

  const logFor = (date: string) =>
    [...saved, ...logs].find((entry) => entry.performedOn === date) ?? null;
  const shown = logFor(shownDate);
  const done = shown?.completed === true;
  const canLog = days.length > 0;

  const doneBadge = (
    <span className="inline-flex items-center gap-1.5 text-base font-medium">
      <CircleCheckIcon aria-hidden className="text-primary size-5" />
      {t("done")}
    </span>
  );
  if (!canLog) return done ? doneBadge : null;

  const onSaved = (log: PatientLog) => {
    setSaved((current) => [
      log,
      ...current.filter((entry) => entry.performedOn !== log.performedOn),
    ]);
    setOpen(false);
    router.refresh();
  };
  const day = days.find((d) => d.date === selected) ?? days[0]!;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {done ? doneBadge : null}
      <Button
        size="lg"
        variant={done ? "outline" : "default"}
        className="h-12 px-5 text-base"
        onClick={() => {
          setSelected(days.find((d) => d.date === shownDate)?.date ?? days.at(-1)!.date);
          setOpen(true);
        }}
      >
        {done ? t("edit") : t("markDone")}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="mx-auto max-h-[90dvh] max-w-2xl overflow-y-auto rounded-t-2xl text-sm"
        >
          <SheetHeader className="relative pr-14">
            <SheetTitle className="text-lg">{t("title")}</SheetTitle>
            <SheetDescription className="text-sm wrap-anywhere">{routineName}</SheetDescription>
            <SheetClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-3 right-3 size-10"
                aria-label={t("close")}
              >
                <XIcon aria-hidden />
              </Button>
            </SheetClose>
          </SheetHeader>
          <LogForm
            // A fresh form (prefilled from that day's log) whenever the day changes.
            key={day.date}
            code={code}
            routineId={routineId}
            entryId={entryId}
            day={day}
            days={days}
            initial={logFor(day.date)}
            onDayChange={setSelected}
            onSaved={onSaved}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function LogForm({
  code,
  routineId,
  entryId,
  day,
  days,
  initial,
  onDayChange,
  onSaved,
}: {
  code: string;
  routineId: string;
  entryId: string | null;
  day: LoggableDay;
  days: LoggableDay[];
  initial: PatientLog | null;
  onDayChange: (date: string) => void;
  onSaved: (log: PatientLog) => void;
}) {
  const t = useTranslations("Patient.logging");
  const id = useId();
  const [pain, setPain] = useState<number | null>(initial?.pain ?? null);
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (_state, formData) => {
      const undo = formData.get("intent") === "undo";
      const comment = String(formData.get("comment") ?? "");
      let result: LogActionResult;
      try {
        result = await logSessionAction(code, {
          routineId,
          entryId,
          performedOn: day.date,
          completed: !undo,
          pain: parsePain(formData.get("pain")),
          comment: comment.trim() === "" ? null : comment,
        });
      } catch {
        return { status: "error", error: "generic" };
      }
      if (!result.ok) return { status: "error", error: result.error };
      onSaved(result.data);
      return { status: "idle" };
    },
    { status: "idle" },
  );

  return (
    <form action={action} className="grid gap-5 px-6 pb-6">
      {days.length > 1 ? (
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">{t("day.label")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {days.map((option) => (
              <label
                key={option.date}
                className={cn(
                  "has-focus-visible:ring-ring/50 flex h-12 cursor-pointer items-center justify-center rounded-lg border text-base font-medium has-focus-visible:ring-[3px]",
                  option.date === day.date
                    ? "bg-primary text-primary-foreground border-transparent"
                    : "bg-background hover:bg-muted",
                )}
              >
                <input
                  type="radio"
                  name="day"
                  value={option.date}
                  checked={option.date === day.date}
                  onChange={() => onDayChange(option.date)}
                  className="sr-only"
                />
                {t(`day.${option.relative}`)}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <PainScale name="pain" value={pain} onChange={setPain} />

      <div className="grid gap-2">
        <Label htmlFor={`${id}-comment`} className="text-sm">
          {t("comment.label")}
        </Label>
        <Textarea
          id={`${id}-comment`}
          name="comment"
          defaultValue={initial?.comment ?? ""}
          maxLength={LOG_COMMENT_MAX}
          rows={3}
          placeholder={t("comment.placeholder")}
          className="min-h-24 text-base"
        />
      </div>

      {state.status === "error" ? (
        <Alert variant="destructive">
          <AlertDescription>{t(`errors.${state.error}`)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-2">
        <Button type="submit" size="lg" className="h-12 text-base" disabled={pending}>
          {t("save")}
        </Button>
        {initial?.completed ? (
          <Button
            type="submit"
            name="intent"
            value="undo"
            variant="ghost"
            size="lg"
            className="h-12 text-base"
            disabled={pending}
          >
            {t("undo")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
