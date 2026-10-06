"use client";

import { useFormatter, useTranslations } from "next-intl";

import { formatSetWeights } from "@/lib/session-logs";

import type { SessionSummaryData } from "./session-summary-data";

/** What the patient logged for the routine's session: its pain, RPE and note, then each exercise. */
export function SessionSummary({ summary }: { summary: SessionSummaryData }) {
  const t = useTranslations("Patient.summary");
  const format = useFormatter();
  const formatKg = (kg: number) =>
    format.number(kg, { useGrouping: false, maximumFractionDigits: 1 });
  const routineLine = [
    summary.pain !== null ? t("pain", { value: summary.pain }) : null,
    summary.rpe !== null ? t("rpe", { value: summary.rpe }) : null,
  ].filter((part) => part !== null);

  return (
    <section aria-label={t("title")} className="bg-muted grid gap-2 rounded-lg p-3 text-sm">
      {routineLine.length > 0 ? <p>{routineLine.join(" · ")}</p> : null}
      {summary.comment ? (
        <p className="line-clamp-2 wrap-anywhere whitespace-pre-line">{summary.comment}</p>
      ) : null}
      {summary.exercises.length > 0 ? (
        <ul className="grid gap-1.5">
          {summary.exercises.map((exercise) => {
            const values = [
              exercise.setWeightsKg !== null
                ? t("weights", { value: formatSetWeights(exercise.setWeightsKg, formatKg) })
                : null,
              exercise.rpe !== null ? t("rpe", { value: exercise.rpe }) : null,
            ].filter((value) => value !== null);
            return (
              <li key={exercise.exerciseId} className="grid gap-0.5">
                <p className="wrap-anywhere">
                  <span className="font-medium">{exercise.name}</span>
                  {values.length > 0 ? ` ${values.join(" · ")}` : null}
                </p>
                {exercise.comment ? (
                  <p className="text-muted-foreground line-clamp-1 wrap-anywhere">
                    {exercise.comment}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
