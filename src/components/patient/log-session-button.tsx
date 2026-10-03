"use client";

import { CircleCheckIcon, XIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Textarea } from "@/components/ui/textarea";
import { LOG_COMMENT_MAX } from "@/lib/session-logs";
import { cn } from "@/lib/utils";
import { logSessionAction, type LogActionResult } from "@/server/patient/actions";
import type { PatientLog } from "@/server/patient/log-session";

import { PainScale } from "./pain-scale";
import { PATIENT_ROW_BUTTON } from "./row-button";

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
  const locale = useLocale();
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
    <span className="inline-flex flex-none items-center gap-1.5 text-base font-medium">
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

  // `contents`: the badge and the button are items of the row this sits in (the routine's
  // action row, next to Start workout), not a box of their own.
  return (
    <div className="contents">
      {done ? doneBadge : null}
      <Button
        size="lg"
        variant={done ? "outline" : "default"}
        // Done, the badge says it all and Edit stays compact; to do, it shares the row equally.
        className={done ? "h-12 flex-none px-5 text-base" : PATIENT_ROW_BUTTON}
        onClick={() => {
          setSelected(days.find((d) => d.date === shownDate)?.date ?? days.at(-1)!.date);
          setOpen(true);
        }}
      >
        {done ? t("edit") : t("markDone")}
      </Button>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent
          // The sheet is portalled out of the patient page, so it carries the page's branding
          // scope (the physio's accent) and the customer's language itself.
          data-brand="patient"
          lang={locale}
          className="mx-auto max-h-[90dvh] max-w-2xl rounded-t-2xl text-sm"
        >
          <DrawerHeader className="relative pr-14">
            <DrawerTitle className="text-lg">{t("title")}</DrawerTitle>
            <DrawerDescription className="text-sm wrap-anywhere">{routineName}</DrawerDescription>
            <DrawerClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-3 right-3 size-10"
                aria-label={t("close")}
              >
                <XIcon aria-hidden />
              </Button>
            </DrawerClose>
          </DrawerHeader>
          {/* The drawer itself cannot scroll (vaul owns its gestures); this inner box does. */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
          </div>
        </DrawerContent>
      </Drawer>
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
  // Controlled, like the pain: React resets a form's uncontrolled fields after its action, which
  // would wipe what the patient typed when saving fails.
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [state, setState] = useState<FormState>({ status: "idle" });
  const [pending, startTransition] = useTransition();

  // Submitted from the controlled fields rather than a form `action`: React resets a form after
  // its action, which would drop the pain rating on a retry after a failed save.
  const save = (completed: boolean) =>
    startTransition(async () => {
      let result: LogActionResult;
      try {
        result = await logSessionAction(code, {
          routineId,
          entryId,
          performedOn: day.date,
          completed,
          pain,
          comment: comment.trim() === "" ? null : comment,
        });
      } catch {
        setState({ status: "error", error: "generic" });
        return;
      }
      if (!result.ok) {
        setState({ status: "error", error: result.error });
        return;
      }
      setState({ status: "idle" });
      onSaved(result.data);
    });
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save(true);
  };

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-5 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
    >
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
          value={comment}
          onChange={(event) => setComment(event.target.value)}
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
            type="button"
            onClick={() => save(false)}
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
