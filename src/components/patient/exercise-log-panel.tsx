"use client";

import { CheckIcon, PlusIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  LOG_COMMENT_MAX,
  SET_WEIGHTS_MAX,
  WEIGHT_MAX,
  normalizeSetWeights,
  parseWeight,
} from "@/lib/session-logs";
import { cn } from "@/lib/utils";
import { logExerciseAction, type ExerciseLogActionResult } from "@/server/patient/actions";
import type { LogExerciseInput, PatientExerciseLog } from "@/server/patient/log-exercise";
import type { PatientItem } from "@/server/patient/view";

import type { ExerciseLogging } from "./exercise-list";
import { DayToggle, useLogDay } from "./log-sheet";
import { RpeScale } from "./rpe-scale";
import { setTargets } from "./set-targets";
import { useAutosave } from "./use-autosave";

type LogError = Exclude<ExerciseLogActionResult, { ok: true }>["error"];

/** The log of this exercise on a day, from what the page loaded. */
export function exerciseLogFor(
  logs: readonly PatientExerciseLog[],
  exerciseId: string,
  date: string,
): PatientExerciseLog | null {
  return logs.find((log) => log.exerciseId === exerciseId && log.performedOn === date) ?? null;
}

/** "20" from "20", "20 kg", "12,5kg"; null for anything else ("light band", "BW+5"). */
export function numericLoad(load: string | null): number | null {
  const match = load?.match(/^\s*(\d+(?:[.,]\d+)?)\s*(?:kg)?\s*$/i);
  return match ? (parseWeight(match[1]!) ?? null) : null;
}

type Props = {
  /** DOM id, for the row toggle's aria-controls. */
  id: string;
  item: PatientItem;
  logging: ExerciseLogging;
  /** The exercise's log on a day: as loaded, or as saved here since. */
  logFor: (date: string) => PatientExerciseLog | null;
  /** Called with what a save stored (null: the log was cleared). */
  remember: (date: string, log: PatientExerciseLog | null) => void;
};

/**
 * The inline log of one exercise (spec 20), inside its row's card: the day, a weight per set,
 * the RPE and a comment, saved as the patient types. Nothing when no day can be logged.
 */
export function ExerciseLogPanel({ id, item, logging, logFor, remember }: Props) {
  const t = useTranslations("Patient");
  const { day, select } = useLogDay(logging.days, logging.shownDate);
  if (!day) return null;
  return (
    <section
      id={id}
      aria-label={t("exerciseLog.title", { name: item.name })}
      className="grid gap-4 border-t px-1 pt-3 pb-1"
    >
      <DayToggle days={logging.days} value={day.date} onChange={select} name={`${id}-day`} />
      {/* Fresh fields per day; unmounting the old ones sends their pending save. */}
      <LogFields
        key={day.date}
        id={id}
        item={item}
        logging={logging}
        date={day.date}
        initial={logFor(day.date)}
        remember={remember}
      />
    </section>
  );
}

type Fields = { weights: string[]; rpe: number | null; comment: string };

function LogFields({
  id,
  item,
  logging,
  date,
  initial,
  remember,
}: {
  id: string;
  item: PatientItem;
  logging: ExerciseLogging;
  date: string;
  initial: PatientExerciseLog | null;
  remember: Props["remember"];
}) {
  const t = useTranslations("Patient");
  const tWorkout = useTranslations("Workout");
  const format = useFormatter();
  const formatKg = (kg: number) =>
    format.number(kg, { useGrouping: false, maximumFractionDigits: 1 });

  const strength = item.kind !== "aerobic";
  const [lines, setLines] = useState(() => {
    const logged = initial?.setWeightsKg?.length ?? 0;
    // Aerobic exercises log no sets; one carried over from an old single weight still shows.
    return strength ? Math.max(item.sets.length, logged, 1) : logged;
  });
  const [fields, setFields] = useState<Fields>(() => ({
    weights: (initial?.setWeightsKg ?? []).map((kg) => (kg === null ? "" : formatKg(kg))),
    rpe: initial?.rpe ?? null,
    comment: initial?.comment ?? "",
  }));
  const [invalid, setInvalid] = useState<ReadonlySet<number>>(() => new Set());
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const { status, error, schedule, flush, retry } = useAutosave<
    LogExerciseInput,
    PatientExerciseLog | null,
    LogError
  >({
    save: (values) => logExerciseAction(logging.code, values),
    onSaved: (log) => remember(date, log),
  });

  /** Applies a change and queues the save; false (nothing queued) while a weight is invalid. */
  const update = (patch: Partial<Fields>): boolean => {
    const next = { ...fields, ...patch };
    setFields(next);
    const parsed = next.weights.map(parseWeight);
    const bad = new Set(parsed.flatMap((kg, index) => (kg === undefined ? [index] : [])));
    setInvalid(bad);
    if (bad.size > 0) return false;
    const comment = next.comment.trim();
    schedule({
      routineId: logging.routineId,
      entryId: logging.entryId,
      exerciseId: item.exerciseId,
      performedOn: date,
      rpe: next.rpe,
      setWeightsKg: normalizeSetWeights(parsed.map((kg) => kg ?? null)),
      comment: comment === "" ? null : comment,
    });
    return true;
  };

  const setWeight = (index: number, value: string) =>
    update({
      weights: Array.from({ length: Math.max(lines, fields.weights.length) }, (_, i) =>
        i === index ? value : (fields.weights[i] ?? ""),
      ),
    });

  /** The previous set's weight, else this set's prescribed load when it is a plain number. */
  const placeholder = (index: number) => {
    const previous = index > 0 ? parseWeight(fields.weights[index - 1] ?? "") : null;
    const kg = previous ?? numericLoad(item.sets[index]?.load ?? null);
    return kg === null ? "" : formatKg(kg);
  };

  const onEnter = (index: number) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const next = inputs.current[index + 1];
    if (next) next.focus();
    else event.currentTarget.blur();
  };

  return (
    <>
      {lines > 0 ? (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">{t("exerciseLog.sets.legend")}</legend>
          <ol className="grid gap-2">
            {Array.from({ length: lines }, (_, index) => (
              <li key={index} className="flex items-center gap-3">
                <span className="w-14 flex-none text-sm font-medium">
                  {t("exerciseLog.sets.set", { number: index + 1 })}
                </span>
                <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                  {setTargets(item.sets[index], tWorkout).join(" · ")}
                </span>
                <div className="relative w-28 flex-none">
                  <Input
                    ref={(element) => {
                      inputs.current[index] = element;
                    }}
                    type="text"
                    inputMode="decimal"
                    enterKeyHint={index < lines - 1 ? "next" : "done"}
                    autoComplete="off"
                    aria-label={t("exerciseLog.sets.input", { number: index + 1 })}
                    aria-invalid={invalid.has(index) || undefined}
                    placeholder={placeholder(index)}
                    value={fields.weights[index] ?? ""}
                    onChange={(event) => setWeight(index, event.target.value)}
                    onBlur={flush}
                    onKeyDown={onEnter(index)}
                    className="h-11 pr-9 text-base md:text-base"
                  />
                  <span
                    aria-hidden
                    className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm"
                  >
                    kg
                  </span>
                </div>
              </li>
            ))}
          </ol>
          {invalid.size > 0 ? (
            <p className="text-destructive text-xs">
              {t("exerciseLog.sets.invalid", { max: WEIGHT_MAX })}
            </p>
          ) : null}
          {strength ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-self-start"
              disabled={lines >= SET_WEIGHTS_MAX}
              onClick={() => setLines((count) => Math.min(count + 1, SET_WEIGHTS_MAX))}
            >
              <PlusIcon aria-hidden />
              {t("exerciseLog.sets.add")}
            </Button>
          ) : null}
        </fieldset>
      ) : null}

      <RpeScale
        name={`${id}-rpe`}
        value={fields.rpe}
        // A discrete choice: saved at once.
        onChange={(rpe) => {
          if (update({ rpe })) flush();
        }}
      />

      <div className="grid gap-2">
        <Label htmlFor={`${id}-comment`} className="text-sm">
          {t("exerciseLog.comment.label")}
        </Label>
        <Textarea
          id={`${id}-comment`}
          value={fields.comment}
          onChange={(event) => update({ comment: event.target.value })}
          onBlur={flush}
          maxLength={LOG_COMMENT_MAX}
          rows={2}
          placeholder={t("exerciseLog.comment.placeholder")}
          className="min-h-16 text-base md:text-base"
        />
      </div>

      <div className="flex min-h-6 flex-wrap items-center gap-x-2 text-xs">
        <p
          aria-live="polite"
          className={cn(
            "flex items-center gap-1",
            status === "error" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {status === "saving" ? t("exerciseLog.status.saving") : null}
          {status === "saved" ? (
            <>
              <CheckIcon aria-hidden className="text-primary size-3.5" />
              {t("exerciseLog.status.saved")}
            </>
          ) : null}
          {status === "error" ? (
            <>
              <span>{t("exerciseLog.status.error")}</span>
              <span>{t(`exerciseLog.errors.${error ?? "generic"}`)}</span>
            </>
          ) : null}
        </p>
        {status === "error" ? (
          <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={retry}>
            {t("exerciseLog.retry")}
          </Button>
        ) : null}
      </div>
    </>
  );
}
