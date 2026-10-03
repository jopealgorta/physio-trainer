import { PlayIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { Route } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { YouTubePreview } from "@/components/library/youtube-preview";
import { PATIENT_ROW_BUTTON } from "@/components/patient/row-button";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import { formatPrescription, type PrescriptionTranslate } from "@/lib/prescription";
import type { PatientBlock, PatientItem, PatientRoutine } from "@/server/patient/view";

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** One routine: its notes and the exercises, supersets as one block. Server-rendered. */
export async function RoutineView({
  routine,
  locale,
  headingLevel = 3,
  label,
  startHref,
  logSlot,
}: {
  routine: PatientRoutine;
  locale: Locale;
  headingLevel?: 2 | 3;
  /** The plan entry's label ("Morning"), shown above the routine name. */
  label?: string | null;
  /** The guided workout for this routine (spec 12); omitted where it cannot start. */
  startHref?: string;
  /** Where the patient marks this routine as done (spec 13). */
  logSlot?: ReactNode;
}) {
  const [t, tPrescription] = await Promise.all([
    getTranslations({ locale, namespace: "Patient" }),
    getTranslations({ locale, namespace: "Prescription" }),
  ]);
  const summary: PrescriptionTranslate = (key, values) => tPrescription(key, values);
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const frequency = [
    routine.sessionsPerWeek !== null
      ? t("sessions.perWeek", { count: routine.sessionsPerWeek })
      : null,
    routine.sessionsPerDay !== null
      ? t("sessions.perDay", { count: routine.sessionsPerDay })
      : null,
  ].filter(Boolean);

  return (
    <article className="grid gap-4">
      <header className="grid gap-1">
        {label ? <p className="text-muted-foreground text-sm font-medium">{label}</p> : null}
        <Heading className="text-lg font-semibold tracking-tight wrap-anywhere">
          {routine.name}
        </Heading>
        {frequency.length > 0 ? (
          <p className="text-muted-foreground text-sm">{frequency.join(" · ")}</p>
        ) : null}
      </header>
      {/* One row on a phone: Start and Mark as done share it equally, and whichever is alone
          takes all of it. The log slot's own elements are items of this row (see
          LogSessionButton); with neither, the empty row is hidden. */}
      <div className="flex items-center gap-3 empty:hidden sm:flex-wrap">
        {startHref && routine.blocks.length > 0 ? (
          <Button asChild size="lg" className={PATIENT_ROW_BUTTON}>
            <Link href={startHref as Route} prefetch={false}>
              <PlayIcon aria-hidden />
              {t("startWorkout")}
            </Link>
          </Button>
        ) : null}
        {logSlot}
      </div>
      {routine.notes ? (
        <section aria-label={t("notes")} className="bg-muted rounded-lg p-3 text-sm">
          <p className="wrap-anywhere whitespace-pre-line">{routine.notes}</p>
        </section>
      ) : null}
      <ol className="grid gap-4">
        {routine.blocks.map((block, index) => (
          <li key={block.kind === "single" ? block.item.id : block.key}>
            <BlockView block={block} position={index + 1} t={t as Translate} summary={summary} />
          </li>
        ))}
      </ol>
    </article>
  );
}

function BlockView({
  block,
  position,
  t,
  summary,
}: {
  block: PatientBlock;
  position: number;
  t: Translate;
  summary: PrescriptionTranslate;
}) {
  if (block.kind === "single") {
    return <ExerciseCard item={block.item} position={position} t={t} summary={summary} />;
  }
  return (
    <section className="grid gap-3 rounded-xl border-2 border-dashed p-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          {t("exercise.superset")} · {position}
        </p>
        {block.restSeconds !== null ? (
          <p className="text-muted-foreground text-xs">
            {t("exercise.supersetRest", { value: block.restSeconds })}
          </p>
        ) : null}
      </header>
      <ul className="grid gap-3">
        {block.items.map((item) => (
          <li key={item.id}>
            <ExerciseCard item={item} t={t} summary={summary} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ExerciseCard({
  item,
  position,
  t,
  summary,
}: {
  item: PatientItem;
  position?: number;
  t: Translate;
  summary: PrescriptionTranslate;
}) {
  const prescription = formatPrescription(
    {
      sets: item.sets,
      holdSeconds: item.holdSeconds,
      restSeconds: item.restSeconds,
      side: item.side,
    },
    summary,
  );
  return (
    <div className="bg-card grid gap-3 rounded-xl border p-3">
      {item.media.map((media) => (
        <YouTubePreview
          key={media.videoId}
          videoId={media.videoId}
          isShort={media.isShort}
          title={item.name}
          className="mx-auto"
        />
      ))}
      <div className="grid gap-1">
        <h4 className="font-semibold wrap-anywhere">
          {position ? <span className="text-muted-foreground mr-1.5">{position}.</span> : null}
          {item.name}
        </h4>
        {prescription ? (
          <p className="bg-muted w-fit rounded-md px-2 py-1 text-sm font-medium">{prescription}</p>
        ) : null}
      </div>
      {item.notes ? (
        <p className="text-sm wrap-anywhere">
          <span className="font-medium">{t("exercise.notes")}: </span>
          {item.notes}
        </p>
      ) : null}
      {item.instructions ? (
        <details className="group text-sm">
          <summary className="focus-visible:ring-ring/50 cursor-pointer rounded-sm font-medium outline-none focus-visible:ring-[3px]">
            {t("exercise.instructions")}
          </summary>
          <p className="text-muted-foreground mt-2 wrap-anywhere whitespace-pre-line">
            {item.instructions}
          </p>
        </details>
      ) : null}
    </div>
  );
}
