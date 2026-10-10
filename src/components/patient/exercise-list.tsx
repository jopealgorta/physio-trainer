"use client";

import { DumbbellIcon, NotebookPenIcon, PlayIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

import { YouTubeThumbnail } from "@/components/library/youtube-thumbnail";
import { Button } from "@/components/ui/button";
import { formatPrescription, type PrescriptionTranslate } from "@/lib/prescription";
import { visibleSections } from "@/lib/routine-sections";
import { cn } from "@/lib/utils";
import type { PatientExerciseLog } from "@/server/patient/log-exercise";
import type { PatientItem, PatientSection } from "@/server/patient/view";

import { ExerciseDetail } from "./exercise-detail";
import { ExerciseLogPanel, exerciseLogFor, type LogDraft } from "./exercise-log-panel";
import { useSavedLogs } from "./log-sheet";

/** What the rows need to show and write exercise logs for one routine (and plan entry). */
export type ExerciseLogging = {
  code: string;
  routineId: string;
  entryId: string | null;
  /** Whether the shown day can be logged: it is today, and the visitor is not the physio previewing. */
  canLog: boolean;
  /** The day the filled Log toggle stands for, and the day a log is saved for. */
  shownDate: string;
  /** This routine and entry's exercise logs, any day. */
  logs: PatientExerciseLog[];
};

/**
 * One page refresh this long after the last saved log: keeps the router cache (back/forward)
 * current without refetching the page on every autosave.
 */
export const REFRESH_AFTER_SAVE_MS = 1500;

/** One row's view of the routine's exercise logs (shared by rows of the same exercise). */
type RowLogs = {
  logging: ExerciseLogging;
  logFor: (date: string) => PatientExerciseLog | null;
  remember: (date: string, log: PatientExerciseLog | null) => void;
  draftFor: (date: string) => LogDraft | undefined;
  keepDraft: (date: string, draft: LogDraft) => void;
  expanded: boolean;
  onToggle: () => void;
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
 * the video; the Log toggle expands the exercise's inline log (spec 20) inside its card, several
 * at a time. Supersets keep their dashed bracket. Shared by the patient page and the workout.
 */
export function ExerciseList({
  sections,
  sectionHeadingLevel = 3,
  logging,
  openLogs,
  onOpenLogsChange,
  ...workout
}: {
  sections: PatientSection[];
  /** One level under the routine name's heading (shown with two or more non-empty sections). */
  sectionHeadingLevel?: 3 | 4;
  logging?: ExerciseLogging;
  /** Item ids whose log is expanded, when the parent controls it (the workout bar). */
  openLogs?: ReadonlySet<string>;
  onOpenLogsChange?: (ids: ReadonlySet<string>) => void;
} & WorkoutProps) {
  const t = useTranslations("Patient");
  const listId = useId();
  const [ownOpen, setOwnOpen] = useState<ReadonlySet<string>>(() => new Set());
  const open = openLogs ?? ownOpen;
  const setOpen = onOpenLogsChange ?? setOwnOpen;
  // Saved logs by "exerciseId|date": rows of the same exercise share one log, and the Log
  // toggle follows a save at once instead of waiting for a refreshed page.
  const saved = useSavedLogs<PatientExerciseLog>((key) => {
    const [exerciseId = "", date = ""] = key.split("|");
    return logging ? exerciseLogFor(logging.logs, exerciseId, date) : null;
  });
  // Drafts by "exerciseId|date": the fields as last typed, which a reopened panel shows over the
  // saved log (that save may still be on the way, or held back by an invalid weight). Kept while
  // the list lives: a draft is always the latest the patient entered, which is also what the
  // serial autosave stores last. Read only when a panel mounts, so a ref (no re-render) is enough.
  const drafts = useRef(new Map<string, LogDraft>());
  const router = useRouter();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(refreshTimer.current);
    };
  }, []);
  const remember = (key: string, log: PatientExerciseLog | null) => {
    saved.remember(key, log);
    // A panel's last save can land after the list is gone (fire-and-forget on unmount).
    if (!mounted.current) return;
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), REFRESH_AFTER_SAVE_MS);
  };

  const logsFor = (item: PatientItem): RowLogs | undefined =>
    logging && {
      logging,
      logFor: (date) => saved.logFor(`${item.exerciseId}|${date}`),
      remember: (date, log) => remember(`${item.exerciseId}|${date}`, log),
      draftFor: (date) => drafts.current.get(`${item.exerciseId}|${date}`),
      keepDraft: (date, draft) => drafts.current.set(`${item.exerciseId}|${date}`, draft),
      expanded: open.has(item.id),
      onToggle: () => {
        const next = new Set(open);
        if (!next.delete(item.id)) next.add(item.id);
        setOpen(next);
      },
    };

  const shown = visibleSections(sections);
  const SectionHeading = sectionHeadingLevel === 4 ? "h4" : "h3";
  // First number of each section: numbering continues across sections.
  const starts: number[] = [];
  shown.sections.forEach((_, index) => {
    starts.push(index === 0 ? 1 : starts[index - 1]! + shown.sections[index - 1]!.blocks.length);
  });
  return (
    <div className="grid gap-4">
      {shown.sections.map((section, sectionIndex) => {
        const start = starts[sectionIndex]!;
        return (
          <section
            key={section.key}
            aria-labelledby={shown.headings ? `${listId}-${section.key}` : undefined}
            className="grid gap-2"
          >
            {shown.headings ? (
              <SectionHeading
                id={`${listId}-${section.key}`}
                className="text-base font-semibold wrap-anywhere"
              >
                {section.name}
              </SectionHeading>
            ) : null}
            <ol start={start} className="grid gap-2">
              {section.blocks.map((block, index) =>
                block.kind === "single" ? (
                  <ExerciseRow
                    key={block.item.id}
                    item={block.item}
                    position={start + index}
                    logs={logsFor(block.item)}
                    {...workout}
                  />
                ) : (
                  <li key={block.key}>
                    <section className="grid gap-2 rounded-xl border-2 border-dashed p-2">
                      <header className="flex flex-wrap items-center justify-between gap-2 px-1">
                        <p className="text-sm font-semibold">
                          {t("exercise.superset")} · {start + index}
                        </p>
                        {block.restSeconds !== null ? (
                          <p className="text-muted-foreground text-xs">
                            {t("exercise.supersetRest", { value: block.restSeconds })}
                          </p>
                        ) : null}
                      </header>
                      <ul className="grid gap-2">
                        {block.items.map((item) => (
                          <ExerciseRow
                            key={item.id}
                            item={item}
                            logs={logsFor(item)}
                            {...workout}
                          />
                        ))}
                      </ul>
                    </section>
                  </li>
                ),
              )}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

function ExerciseRow({
  item,
  position,
  logs,
  currentItemId,
  doneSets,
  currentRef,
}: {
  item: PatientItem;
  position?: number;
  logs?: RowLogs;
} & WorkoutProps) {
  const t = useTranslations("Patient");
  const tPrescription = useTranslations("Prescription");
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const summary: PrescriptionTranslate = (key, values) => tPrescription(key, values);
  const prescription = formatPrescription(item, summary);
  const current = currentItemId === item.id;
  const video = item.media[0];
  const log = logs ? logs.logFor(logs.logging.shownDate) : null;
  const canLog = logs !== undefined && logs.logging.canLog;
  const expanded = canLog && logs.expanded;
  const logLabel = t("exercise.log", { name: item.name });
  const done = doneSets ? (doneSets[item.id] ?? 0) : null;
  const openDetail = () => setOpen(true);

  return (
    <li
      ref={current ? currentRef : undefined}
      aria-current={current ? "step" : undefined}
      className={cn(
        "bg-card grid gap-2 rounded-xl border p-2",
        current && "ring-primary bg-primary/5 ring-2",
      )}
    >
      <div className="flex gap-3">
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
        </div>
        {canLog ? (
          <Button
            type="button"
            variant={expanded ? "secondary" : "ghost"}
            size="icon"
            aria-expanded={expanded}
            aria-controls={panelId}
            aria-label={logLabel}
            title={logLabel}
            className={cn("size-12 flex-none self-center", log !== null && "text-primary")}
            onClick={logs.onToggle}
          >
            <NotebookPenIcon aria-hidden className={cn("size-5", log !== null && "stroke-[2.5]")} />
          </Button>
        ) : null}
      </div>
      {expanded ? (
        <ExerciseLogPanel
          id={panelId}
          item={item}
          logging={logs.logging}
          logFor={logs.logFor}
          remember={logs.remember}
          draftFor={logs.draftFor}
          keepDraft={logs.keepDraft}
        />
      ) : null}
      <ExerciseDetail item={item} prescription={prescription} open={open} onOpenChange={setOpen} />
    </li>
  );
}
