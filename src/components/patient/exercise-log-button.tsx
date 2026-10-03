"use client";

import { NotebookPenIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LOG_COMMENT_MAX, WEIGHT_MAX, parseWeight } from "@/lib/session-logs";
import { cn } from "@/lib/utils";
import { logExerciseAction, type ExerciseLogActionResult } from "@/server/patient/actions";
import type { PatientExerciseLog } from "@/server/patient/log-exercise";

import type { ExerciseLogging } from "./exercise-list";
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

type LogError = Exclude<ExerciseLogActionResult, { ok: true }>["error"];

/** The log of this exercise on a day, from what the page loaded. */
export function exerciseLogFor(
  logs: readonly PatientExerciseLog[],
  exerciseId: string,
  date: string,
): PatientExerciseLog | null {
  return logs.find((log) => log.exerciseId === exerciseId && log.performedOn === date) ?? null;
}

/**
 * "Log" for one exercise (spec 19): a bottom sheet with pain, RPE, the weight used and a comment,
 * all optional; saving with everything empty clears the log. The row variant is a small icon
 * button, filled once the shown day is logged; the bar variant is the workout bottom bar's
 * full-width "Log exercise" button (the bar names the exercise right above it).
 */
export function ExerciseLogButton({
  logging,
  exerciseId,
  exerciseName,
  defaultOpen = false,
  variant = "row",
}: {
  logging: ExerciseLogging;
  exerciseId: string;
  exerciseName: string;
  /** Open at once (workout bar). */
  defaultOpen?: boolean;
  variant?: "row" | "bar";
}) {
  const t = useTranslations("Patient");
  const tWorkout = useTranslations("Workout");
  const router = useRouter();
  const { days, shownDate } = logging;
  const [open, setOpen] = useState(defaultOpen && days.length > 0);
  const { logFor, remember } = useSavedLogs((date) =>
    exerciseLogFor(logging.logs, exerciseId, date),
  );
  const { day, select, reset } = useLogDay(days, shownDate);

  if (!day) return null;

  const logged = logFor(shownDate) !== null;
  const bar = variant === "bar";
  const label = t("exercise.log", { name: exerciseName });

  const onSaved = (date: string, log: PatientExerciseLog | null) => {
    remember(date, log);
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <Button
        type="button"
        variant={bar ? "outline" : "ghost"}
        size={bar ? "lg" : "icon"}
        // The bar's visible text is its name; the row's icon needs one.
        aria-label={bar ? undefined : label}
        title={bar ? undefined : label}
        className={cn(
          bar ? "h-12 w-full text-base" : "size-12 flex-none self-center",
          logged && "text-primary",
        )}
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <NotebookPenIcon aria-hidden className={cn("size-5", logged && "stroke-[2.5]")} />
        {bar ? tWorkout("logExercise") : null}
      </Button>
      <LogSheet
        open={open}
        onOpenChange={setOpen}
        title={t("exerciseLog.title", { name: exerciseName })}
        closeLabel={t("exerciseLog.close")}
      >
        <ExerciseLogForm
          // A fresh form (prefilled from that day's log) whenever the day changes.
          key={day.date}
          logging={logging}
          exerciseId={exerciseId}
          day={day}
          initial={logFor(day.date)}
          onDayChange={select}
          onSaved={onSaved}
        />
      </LogSheet>
    </>
  );
}

function ExerciseLogForm({
  logging,
  exerciseId,
  day,
  initial,
  onDayChange,
  onSaved,
}: {
  logging: ExerciseLogging;
  exerciseId: string;
  day: LoggableDay;
  initial: PatientExerciseLog | null;
  onDayChange: (date: string) => void;
  onSaved: (date: string, log: PatientExerciseLog | null) => void;
}) {
  const t = useTranslations("Patient");
  const format = useFormatter();
  const id = useId();
  const [pain, setPain] = useState<number | null>(initial?.pain ?? null);
  const [rpe, setRpe] = useState<number | null>(initial?.rpe ?? null);
  const [weight, setWeight] = useState(
    initial?.weightKg != null
      ? format.number(initial.weightKg, { useGrouping: false, maximumFractionDigits: 1 })
      : "",
  );
  const [weightInvalid, setWeightInvalid] = useState(false);
  const [comment, setComment] = useState(initial?.comment ?? "");
  const { error, pending, submit } = useLogSubmit<PatientExerciseLog | null, LogError>();

  // Submitted from the controlled fields, not a form `action` (React resets a form after it).
  const send = (values: {
    pain: number | null;
    rpe: number | null;
    weightKg: number | null;
    comment: string | null;
  }) =>
    submit(
      () =>
        logExerciseAction(logging.code, {
          routineId: logging.routineId,
          entryId: logging.entryId,
          exerciseId,
          performedOn: day.date,
          ...values,
        }),
      (log) => onSaved(day.date, log),
    );

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const weightKg = parseWeight(weight);
    if (weightKg === undefined) {
      setWeightInvalid(true);
      return;
    }
    setWeightInvalid(false);
    send({ pain, rpe, weightKg, comment: comment.trim() === "" ? null : comment });
  };

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="grid gap-5 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
    >
      <DayToggle days={logging.days} value={day.date} onChange={onDayChange} />

      <PainScale name="pain" value={pain} onChange={setPain} />

      <RpeScale name="rpe" value={rpe} onChange={setRpe} />

      <div className="grid gap-2">
        <Label htmlFor={`${id}-weight`} className="text-sm">
          {t("exerciseLog.weight.label")}
        </Label>
        <div className="relative w-40">
          <Input
            id={`${id}-weight`}
            name="weight"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={weight}
            onChange={(event) => {
              setWeight(event.target.value);
              setWeightInvalid(false);
            }}
            aria-invalid={weightInvalid || undefined}
            aria-describedby={`${id}-weight-hint`}
            className="h-12 pr-10 text-base"
          />
          <span
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm"
          >
            kg
          </span>
        </div>
        <p
          id={`${id}-weight-hint`}
          className={cn("text-xs", weightInvalid ? "text-destructive" : "text-muted-foreground")}
        >
          {weightInvalid
            ? t("exerciseLog.weight.invalid", { max: WEIGHT_MAX })
            : t("exerciseLog.weight.hint")}
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${id}-comment`} className="text-sm">
          {t("exerciseLog.comment.label")}
        </Label>
        <Textarea
          id={`${id}-comment`}
          name="comment"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={LOG_COMMENT_MAX}
          rows={3}
          placeholder={t("exerciseLog.comment.placeholder")}
          className="min-h-24 text-base"
        />
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{t(`exerciseLog.errors.${error}`)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-2">
        <Button type="submit" size="lg" className="h-12 text-base" disabled={pending}>
          {t("exerciseLog.save")}
        </Button>
        {initial ? (
          <Button
            type="button"
            onClick={() => send({ pain: null, rpe: null, weightKg: null, comment: null })}
            variant="ghost"
            size="lg"
            className="h-12 text-base"
            disabled={pending}
          >
            {t("exerciseLog.clear")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
