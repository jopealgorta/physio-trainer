"use client";

import { CircleCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LOG_COMMENT_MAX } from "@/lib/session-logs";
import { logSessionAction, type LogActionResult } from "@/server/patient/actions";
import type { PatientLog } from "@/server/patient/log-session";

import {
  DayToggle,
  LogSheet,
  useLogDay,
  useLogSubmit,
  useSavedLogs,
  type LoggableDay,
} from "./log-sheet";
import { PainScale } from "./pain-scale";
import { RpeScale } from "./rpe-scale";
import { PATIENT_ROW_BUTTON } from "./row-button";

type LogError = Exclude<LogActionResult, { ok: true }>["error"];

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
  const { logFor, remember } = useSavedLogs(
    (date) => logs.find((entry) => entry.performedOn === date) ?? null,
  );
  const { day, select, reset } = useLogDay(days, shownDate);

  const shown = logFor(shownDate);
  const done = shown?.completed === true;

  const doneBadge = (
    <span className="inline-flex flex-none items-center gap-1.5 text-base font-medium">
      <CircleCheckIcon aria-hidden className="text-primary size-5" />
      {t("done")}
    </span>
  );
  if (!day) return done ? doneBadge : null;

  const onSaved = (log: PatientLog) => {
    remember(log.performedOn, log);
    setOpen(false);
    router.refresh();
  };

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
          reset();
          setOpen(true);
        }}
      >
        {done ? t("edit") : t("markDone")}
      </Button>
      <LogSheet
        open={open}
        onOpenChange={setOpen}
        title={t("title")}
        description={routineName}
        closeLabel={t("close")}
      >
        <LogForm
          // A fresh form (prefilled from that day's log) whenever the day changes.
          key={day.date}
          code={code}
          routineId={routineId}
          entryId={entryId}
          day={day}
          days={days}
          initial={logFor(day.date)}
          onDayChange={select}
          onSaved={onSaved}
        />
      </LogSheet>
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
  const [rpe, setRpe] = useState<number | null>(initial?.rpe ?? null);
  // Controlled, like the pain: React resets a form's uncontrolled fields after its action, which
  // would wipe what the patient typed when saving fails.
  const [comment, setComment] = useState(initial?.comment ?? "");
  const { error, pending, submit } = useLogSubmit<PatientLog, LogError>();

  // Submitted from the controlled fields rather than a form `action`: React resets a form after
  // its action, which would drop the pain rating on a retry after a failed save.
  const save = (completed: boolean) =>
    submit(
      () =>
        logSessionAction(code, {
          routineId,
          entryId,
          performedOn: day.date,
          completed,
          pain,
          rpe,
          comment: comment.trim() === "" ? null : comment,
        }),
      onSaved,
    );
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save(true);
  };

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-5 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
    >
      <DayToggle days={days} value={day.date} onChange={onDayChange} />

      <PainScale name="pain" value={pain} onChange={setPain} />

      <RpeScale name="rpe" value={rpe} onChange={setRpe} />

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

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
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
