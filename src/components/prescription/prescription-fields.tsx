import { useTranslations } from "next-intl";
import { useId } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  LOAD_MAX_LENGTH,
  PRESCRIPTION_LIMITS,
  PRESCRIPTION_NOTES_MAX_LENGTH,
  PRESCRIPTION_SIDES,
  type Prescription,
} from "@/lib/prescription";

export const selectClassName =
  "border-input bg-input/20 dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/30 aria-invalid:border-destructive h-7 w-full rounded-md border px-2 text-sm outline-none focus-visible:ring-2";

type NumberField = keyof typeof PRESCRIPTION_LIMITS;
const NUMBER_FIELDS: NumberField[] = [
  "sets",
  "reps",
  "repsMax",
  "durationSeconds",
  "holdSeconds",
  "restSeconds",
];
const KNOWN_ERRORS = [
  "notAWholeNumber",
  "invalidSide",
  "repsMaxWithoutReps",
  "repsMaxNotAboveReps",
] as const;

/** Default-prescription inputs (spec 03), reused by routine items (spec 05). */
export function PrescriptionFields({
  defaultValue,
  errors = {},
}: {
  defaultValue: Prescription;
  errors?: Partial<Record<keyof Prescription, string>>;
}) {
  const t = useTranslations("Prescription");
  const id = useId();

  const errorText = (name: keyof Prescription): string | null => {
    const code = errors[name];
    if (!code) return null;
    if (code === "outOfRange" && name in PRESCRIPTION_LIMITS) {
      return t("errors.outOfRange", PRESCRIPTION_LIMITS[name as NumberField]);
    }
    if (code === "tooLong") {
      return t("errors.tooLong", {
        max: name === "load" ? LOAD_MAX_LENGTH : PRESCRIPTION_NOTES_MAX_LENGTH,
      });
    }
    const known = KNOWN_ERRORS.find((candidate) => candidate === code);
    return t(`errors.${known ?? "invalid"}`);
  };
  const field = (name: keyof Prescription) => ({
    id: `${id}-${name}`,
    name,
    "aria-invalid": errors[name] !== undefined,
    "aria-describedby": errors[name] ? `${id}-${name}-error` : undefined,
  });
  const message = (name: keyof Prescription) => {
    const text = errorText(name);
    return text ? (
      <p id={`${id}-${name}-error`} className="text-destructive text-sm">
        {text}
      </p>
    ) : null;
  };

  return (
    <fieldset className="grid gap-4">
      <legend className="text-base font-medium">{t("legend")}</legend>
      <p className="text-muted-foreground -mt-2 text-sm">{t("hint")}</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {NUMBER_FIELDS.map((name) => {
          const showHint = name === "repsMax" && !errors.repsMax;
          return (
            <div key={name} className="grid content-start gap-2">
              <Label htmlFor={`${id}-${name}`}>{t(name)}</Label>
              <Input
                {...field(name)}
                type="text"
                inputMode="numeric"
                defaultValue={defaultValue[name] ?? ""}
                aria-describedby={showHint ? `${id}-repsMax-hint` : field(name)["aria-describedby"]}
              />
              {showHint ? (
                <p id={`${id}-repsMax-hint`} className="text-muted-foreground text-xs">
                  {t("repsMaxHint")}
                </p>
              ) : null}
              {message(name)}
            </div>
          );
        })}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor={`${id}-load`}>{t("load")}</Label>
          <Input
            {...field("load")}
            placeholder={t("loadPlaceholder")}
            defaultValue={defaultValue.load ?? ""}
          />
          {message("load")}
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor={`${id}-side`}>{t("side")}</Label>
          <select
            {...field("side")}
            defaultValue={defaultValue.side ?? ""}
            className={selectClassName}
          >
            <option value="">{t("sideNone")}</option>
            {PRESCRIPTION_SIDES.map((side) => (
              <option key={side} value={side}>
                {t(`sides.${side}`)}
              </option>
            ))}
          </select>
          {message("side")}
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-notes`}>{t("notes")}</Label>
        <Textarea {...field("notes")} rows={2} defaultValue={defaultValue.notes ?? ""} />
        {message("notes")}
      </div>
    </fieldset>
  );
}
