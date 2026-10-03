"use client";

import { DumbbellIcon, PlayIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { YouTubeThumbnail } from "@/components/library/youtube-thumbnail";
import { Badge } from "@/components/ui/badge";
import { formatPrescription, type PrescriptionTranslate } from "@/lib/prescription";
import { cn } from "@/lib/utils";
import type { PatientExerciseLog } from "@/server/patient/log-exercise";
import type { PatientBlock, PatientItem } from "@/server/patient/view";

import { ExerciseDetail } from "./exercise-detail";
import { ExerciseLogButton, exerciseLogFor } from "./exercise-log-button";
import type { LoggableDay } from "./log-session-button";

/** What the rows need to show and write exercise logs for one routine (and plan entry). */
export type ExerciseLogging = {
  code: string;
  routineId: string;
  entryId: string | null;
  /** The days that can still be logged (none: chips only, e.g. the physio previewing). */
  days: LoggableDay[];
  /** The day the chips and the filled Log button stand for. */
  shownDate: string;
  /** This routine and entry's exercise logs, any day. */
  logs: PatientExerciseLog[];
};

type WorkoutProps = {
  /** Workout mode: the exercise being done (highlighted, aria-current="step"). */
  currentItemId?: string | null;
  /** Workout mode: sets done per item id; shown as dots. */
  doneSets?: Readonly<Record<string, number>>;
  /** Workout mode: called with the row element of currentItemId so the player can scroll it into view. */
  currentRef?: (element: HTMLLIElement | null) => void;
};

/**
 * A routine's exercises as compact rows (spec 19): thumbnail, name, one-line prescription,
 * notes clamped to a line and what is logged. The thumbnail or the name opens the detail with
 * the video. Supersets keep their dashed bracket. Shared by the patient page and the workout.
 */
export function ExerciseList({
  blocks,
  logging,
  ...workout
}: {
  blocks: PatientBlock[];
  logging?: ExerciseLogging;
} & WorkoutProps) {
  const t = useTranslations("Patient");
  return (
    <ol className="grid gap-2">
      {blocks.map((block, index) =>
        block.kind === "single" ? (
          <ExerciseRow
            key={block.item.id}
            item={block.item}
            position={index + 1}
            logging={logging}
            {...workout}
          />
        ) : (
          <li key={block.key}>
            <section className="grid gap-2 rounded-xl border-2 border-dashed p-2">
              <header className="flex flex-wrap items-center justify-between gap-2 px-1">
                <p className="text-sm font-semibold">
                  {t("exercise.superset")} · {index + 1}
                </p>
                {block.restSeconds !== null ? (
                  <p className="text-muted-foreground text-xs">
                    {t("exercise.supersetRest", { value: block.restSeconds })}
                  </p>
                ) : null}
              </header>
              <ul className="grid gap-2">
                {block.items.map((item) => (
                  <ExerciseRow key={item.id} item={item} logging={logging} {...workout} />
                ))}
              </ul>
            </section>
          </li>
        ),
      )}
    </ol>
  );
}

function ExerciseRow({
  item,
  position,
  logging,
  currentItemId,
  doneSets,
  currentRef,
}: {
  item: PatientItem;
  position?: number;
  logging?: ExerciseLogging;
} & WorkoutProps) {
  const t = useTranslations("Patient");
  const tPrescription = useTranslations("Prescription");
  const [open, setOpen] = useState(false);
  const summary: PrescriptionTranslate = (key, values) => tPrescription(key, values);
  const prescription = formatPrescription(item, summary);
  const current = currentItemId === item.id;
  const video = item.media[0];
  const log = logging ? exerciseLogFor(logging.logs, item.exerciseId, logging.shownDate) : null;
  const chips = log
    ? [
        log.pain !== null ? t("exerciseLog.chips.pain", { value: log.pain }) : null,
        log.rpe !== null ? t("exerciseLog.chips.rpe", { value: log.rpe }) : null,
        log.weightKg !== null ? t("exerciseLog.chips.weight", { value: log.weightKg }) : null,
      ].filter((chip) => chip !== null)
    : [];
  const done = doneSets ? (doneSets[item.id] ?? 0) : null;
  const openDetail = () => setOpen(true);

  return (
    <li
      ref={current ? currentRef : undefined}
      aria-current={current ? "step" : undefined}
      className={cn(
        "bg-card flex gap-3 rounded-xl border p-2",
        current && "ring-primary bg-primary/5 ring-2",
      )}
    >
      <button
        type="button"
        onClick={openDetail}
        aria-label={
          video
            ? t("exercise.open", { name: item.name })
            : t("exercise.detailTitle", { name: item.name })
        }
        className="group focus-visible:ring-ring/50 relative aspect-video w-24 shrink-0 self-start overflow-hidden rounded-lg outline-none focus-visible:ring-[3px]"
      >
        {video ? (
          <>
            <YouTubeThumbnail videoId={video.videoId} />
            <span className="bg-background/80 text-foreground group-hover:bg-primary group-hover:text-primary-foreground absolute inset-0 m-auto flex size-7 items-center justify-center rounded-full shadow-sm transition-colors">
              <PlayIcon aria-hidden className="size-3.5" />
            </span>
          </>
        ) : (
          <span className="bg-muted text-muted-foreground flex size-full items-center justify-center">
            <DumbbellIcon aria-hidden className="size-5" />
          </span>
        )}
      </button>
      <div className="grid min-w-0 flex-1 content-start gap-0.5">
        <h4 className="text-sm font-semibold wrap-anywhere">
          <button
            type="button"
            onClick={openDetail}
            className="focus-visible:ring-ring/50 rounded-sm text-left outline-none hover:underline focus-visible:ring-[3px]"
          >
            {position ? <span className="text-muted-foreground mr-1">{position}.</span> : null}
            {item.name}
          </button>
        </h4>
        {prescription ? (
          <p className="text-muted-foreground text-xs wrap-anywhere">{prescription}</p>
        ) : null}
        {item.notes ? <p className="line-clamp-1 text-xs wrap-anywhere">{item.notes}</p> : null}
        {done !== null ? (
          <p className="flex gap-1 pt-1" aria-hidden>
            {Array.from({ length: Math.max(item.sets.length, 1) }, (_, index) => (
              <span
                key={index}
                data-testid="set-dot"
                data-done={index < done}
                className={cn(
                  "size-2 rounded-full",
                  index < done ? "bg-primary" : "bg-muted-foreground/30",
                )}
              />
            ))}
          </p>
        ) : null}
        {chips.length > 0 ? (
          <ul aria-label={t("exercise.logged")} className="flex flex-wrap gap-1 pt-1">
            {chips.map((chip) => (
              <li key={chip}>
                <Badge variant="secondary">{chip}</Badge>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {logging ? (
        <ExerciseLogButton
          logging={logging}
          exerciseId={item.exerciseId}
          exerciseName={item.name}
        />
      ) : null}
      <ExerciseDetail item={item} prescription={prescription} open={open} onOpenChange={setOpen} />
    </li>
  );
}
