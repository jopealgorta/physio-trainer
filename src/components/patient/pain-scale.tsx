"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { PAIN_SCALE } from "@/lib/session-logs";
import { cn } from "@/lib/utils";

/**
 * Intensity of the `destructive` token behind each rating, so a higher number reads hotter in
 * light and dark without hard-coded colours (the number is always there too). Static strings so
 * Tailwind sees them.
 */
const TINT = [
  "bg-muted",
  "bg-destructive/10",
  "bg-destructive/15",
  "bg-destructive/20",
  "bg-destructive/25",
  "bg-destructive/30",
  "bg-destructive/35",
  "bg-destructive/45",
  "bg-destructive/55",
  "bg-destructive/65",
  "bg-destructive/75",
] as const;

/**
 * The patient's pain rating, 0-10: big touch targets in two rows, optional (it can be cleared).
 * A custom widget on native radios, so the arrow keys and form semantics come for free.
 */
export function PainScale({
  name,
  value,
  onChange,
}: {
  name: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const t = useTranslations("Patient.logging.pain");
  const legendId = useId();
  const hintId = useId();
  return (
    <fieldset aria-labelledby={legendId} aria-describedby={hintId} className="grid gap-2">
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
        {PAIN_SCALE.map((rating) => (
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
    </fieldset>
  );
}
