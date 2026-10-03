import type { useTranslations } from "next-intl";

import { distanceDisplay } from "@/lib/distance";
import { durationDisplay, type SetPrescription } from "@/lib/prescription";

export type WorkoutTranslate = ReturnType<typeof useTranslations<"Workout">>;

/** A set's targets as short labels ("12 reps", "30 s", "Load: 20 kg"); none for no set. */
export function setTargets(set: SetPrescription | undefined, t: WorkoutTranslate): string[] {
  if (!set) return [];
  const labels: string[] = [];
  if (set.reps !== null) {
    labels.push(
      set.repsMax !== null
        ? t("target.range", { min: set.reps, max: set.repsMax })
        : t("target.reps", { count: set.reps }),
    );
  }
  if (set.durationSeconds !== null) {
    const duration = durationDisplay(set.durationSeconds);
    labels.push(
      duration.unit === "minutesSeconds"
        ? t("target.minutesSeconds", { minutes: duration.minutes, seconds: duration.seconds })
        : duration.unit === "minutes"
          ? t("target.minutes", { value: duration.value })
          : t("target.duration", { value: duration.value }),
    );
  }
  if (set.distanceMeters !== null) {
    const distance = distanceDisplay(set.distanceMeters);
    labels.push(
      t(distance.unit === "km" ? "target.distanceKm" : "target.distanceM", {
        value: distance.value,
      }),
    );
  }
  if (set.load) labels.push(t("target.load", { value: set.load }));
  if (set.intensity) labels.push(t("target.intensity", { value: set.intensity }));
  return labels;
}
