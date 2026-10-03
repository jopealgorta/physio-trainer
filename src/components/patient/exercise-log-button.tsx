"use client";

import { NotebookPenIcon, XIcon } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LOG_COMMENT_MAX, WEIGHT_MAX, parseWeight } from "@/lib/session-logs";
import { cn } from "@/lib/utils";
import { logExerciseAction, type ExerciseLogActionResult } from "@/server/patient/actions";
import type { PatientExerciseLog } from "@/server/patient/log-exercise";

import type { ExerciseLogging } from "./exercise-list";
import type { LoggableDay } from "./log-session-button";
import { PainScale } from "./pain-scale";
import { RpeScale } from "./rpe-scale";

type ErrorKey = Exclude<ExerciseLogActionResult, { ok: true }>["error"] | "generic";

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
 * button, filled once the shown day is logged; the bar variant sits in the workout's bottom bar.
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
  const locale = useLocale();
  const router = useRouter();
  const { days, shownDate } = logging;
  const [open, setOpen] = useState(defaultOpen && days.length > 0);
  // Saved here first (null: cleared) so the button follows before the refreshed page arrives.
  const [saved, setSaved] = useState<Record<string, PatientExerciseLog | null>>({});
  const [selected, setSelected] = useState(
    () => days.find((day) => day.date === shownDate)?.date ?? days.at(-1)?.date ?? shownDate,
  );

  if (days.length === 0) return null;

  const logFor = (date: string) =>
    date in saved ? saved[date]! : exerciseLogFor(logging.logs, exerciseId, date);
  const logged = logFor(shownDate) !== null;
  const day = days.find((d) => d.date === selected) ?? days[0]!;
  const label = t("exercise.log", { name: exerciseName });

  const onSaved = (date: string, log: PatientExerciseLog | null) => {
    setSaved((current) => ({ ...current, [date]: log }));
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <Button
        type="button"
        variant={variant === "bar" ? "outline" : "ghost"}
        size="icon"
        aria-label={label}
        title={label}
        className={cn(
          variant === "bar" ? "size-12 flex-none" : "size-10 flex-none self-center",
          logged && "text-primary",
        )}
        onClick={() => {
          setSelected(days.find((d) => d.date === shownDate)?.date ?? days.at(-1)!.date);
          setOpen(true);
        }}
      >
        <NotebookPenIcon aria-hidden className={cn("size-5", logged && "stroke-[2.5]")} />
      </Button>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent
          // Portalled out of the patient page: carries its branding scope and language itself.
          data-brand="patient"
          lang={locale}
          // The title says it all (exercise name included); no description.
          aria-describedby={undefined}
          className="mx-auto max-h-[90dvh] max-w-2xl rounded-t-2xl text-sm"
        >
          <DrawerHeader className="relative pr-14">
            <DrawerTitle className="text-lg wrap-anywhere">
              {t("exerciseLog.title", { name: exerciseName })}
            </DrawerTitle>
            <DrawerClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-3 right-3 size-10"
                aria-label={t("exerciseLog.close")}
              >
                <XIcon aria-hidden />
              </Button>
            </DrawerClose>
          </DrawerHeader>
          {/* The drawer itself cannot scroll (vaul owns its gestures); this inner box does. */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <ExerciseLogForm
              // A fresh form (prefilled from that day's log) whenever the day changes.
              key={day.date}
              logging={logging}
              exerciseId={exerciseId}
              day={day}
              initial={logFor(day.date)}
              onDayChange={setSelected}
              onSaved={onSaved}
            />
          </div>
        </DrawerContent>
      </Drawer>
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
  const [error, setError] = useState<ErrorKey | null>(null);
  const [pending, startTransition] = useTransition();

  // Submitted from the controlled fields, not a form `action` (React resets a form after it).
  const send = (values: {
    pain: number | null;
    rpe: number | null;
    weightKg: number | null;
    comment: string | null;
  }) =>
    startTransition(async () => {
      let result: ExerciseLogActionResult;
      try {
        result = await logExerciseAction(logging.code, {
          routineId: logging.routineId,
          entryId: logging.entryId,
          exerciseId,
          performedOn: day.date,
          ...values,
        });
      } catch {
        setError("generic");
        return;
      }
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      onSaved(day.date, result.data);
    });

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
      {logging.days.length > 1 ? (
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">{t("logging.day.label")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {logging.days.map((option) => (
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
                {t(`logging.day.${option.relative}`)}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

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
