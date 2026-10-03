"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { RPE_SCALE } from "@/lib/session-logs";
import { cn } from "@/lib/utils";

/** Intensity of the `primary` token behind each rating, as static strings so Tailwind sees them. */
const TINT = [
  "bg-muted",
  "bg-primary/10",
  "bg-primary/15",
  "bg-primary/20",
  "bg-primary/25",
  "bg-primary/30",
  "bg-primary/35",
  "bg-primary/40",
  "bg-primary/45",
  "bg-primary/50",
  "bg-primary/60",
] as const;

/** The CR10 descriptor of a rating: 0 rest, 1-2 very easy, 3-4 easy, 5-6 hard, 7-8 very hard, 9, 10. */
function descriptorKey(value: number) {
  if (value === 0) return "rest";
  if (value <= 2) return "veryEasy";
  if (value <= 4) return "easy";
  if (value <= 6) return "hard";
  if (value <= 8) return "veryHard";
  return value === 9 ? "extreme" : "max";
}

/**
 * The patient's effort rating (Borg CR10, 0-10), optional like the pain. Same native-radio
 * widget as `PainScale`.
 */
export function RpeScale({
  name,
  value,
  onChange,
}: {
  name: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const t = useTranslations("Patient.logging.rpe");
  const legendId = useId();
  const hintId = useId();
  const descriptorId = useId();
  return (
    <fieldset
      aria-labelledby={legendId}
      aria-describedby={value !== null ? `${hintId} ${descriptorId}` : hintId}
      className="grid gap-2"
    >
      <div className="flex items-center justify-between gap-2">
        <legend id={legendId} className="text-sm font-medium">
          {t("legend")}
        </legend>
        {value !== null ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 rounded-sm text-sm underline underline-offset-2 outline-none focus-visible:ring-[3px]"
          >
            {t("clear")}
          </button>
        ) : null}
      </div>
      <p id={hintId} className="text-muted-foreground text-sm">
        {t("hint")}
      </p>
      <div className="grid grid-cols-6 gap-2">
        {RPE_SCALE.map((rating) => (
          <label
            key={rating}
            className={cn(
              "has-focus-visible:ring-ring/50 relative flex h-12 cursor-pointer items-center justify-center rounded-lg border text-base font-semibold select-none has-focus-visible:ring-[3px]",
              TINT[rating],
              value === rating && "border-foreground ring-foreground ring-2",
            )}
          >
            <input
              type="radio"
              name={name}
              value={rating}
              checked={value === rating}
              onChange={() => onChange(rating)}
              className="sr-only"
            />
            {rating}
          </label>
        ))}
      </div>
      {value !== null ? (
        <p id={descriptorId} className="text-sm font-medium">
          {t("selected", { value, label: t(`descriptors.${descriptorKey(value)}`) })}
        </p>
      ) : null}
    </fieldset>
  );
}
