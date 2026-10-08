import { flattenSections } from "@/lib/routine-sections";
import { PlayIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { Route } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { ExerciseList, type ExerciseLogging } from "@/components/patient/exercise-list";
import { PATIENT_ROW_BUTTON } from "@/components/patient/row-button";
import { SessionSummary } from "@/components/patient/session-summary";
import type { SessionSummaryData } from "@/components/patient/session-summary-data";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import type { PatientRoutine } from "@/server/patient/view";

/**
 * One routine: its header, actions, notes and the exercises as a compact list (the list is a
 * client component; it gets only serialisable props).
 */
export async function RoutineView({
  routine,
  locale,
  headingLevel = 3,
  label,
  startHref,
  logSlot,
  exerciseLogging,
  summary,
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
  /** Per-exercise logs (spec 19) for this routine and plan entry. */
  exerciseLogging?: ExerciseLogging;
  /** What was logged for the shown day (spec 21), under the action row. */
  summary?: SessionSummaryData | null;
}) {
  const t = await getTranslations({ locale, namespace: "Patient" });
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
        {startHref && flattenSections(routine.sections).length > 0 ? (
          <Button asChild size="lg" className={PATIENT_ROW_BUTTON}>
            <Link href={startHref as Route} prefetch={false}>
              <PlayIcon aria-hidden />
              {t("startWorkout")}
            </Link>
          </Button>
        ) : null}
        {logSlot}
      </div>
      {summary ? <SessionSummary summary={summary} /> : null}
      {routine.notes ? (
        <section aria-label={t("notes")} className="bg-muted rounded-lg p-3 text-sm">
          <p className="wrap-anywhere whitespace-pre-line">{routine.notes}</p>
        </section>
      ) : null}
      <ExerciseList
        sections={routine.sections}
        sectionHeadingLevel={headingLevel === 2 ? 3 : 4}
        logging={exerciseLogging}
      />
    </article>
  );
}
