"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  LOAD_MAX_LENGTH,
  PRESCRIPTION_LIMITS,
  PRESCRIPTION_NOTES_MAX_LENGTH,
  PRESCRIPTION_SIDES,
  type Prescription,
} from "@/lib/prescription";
import { fromSelectValue, toSelectValue } from "@/lib/select-value";

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
  const [side, setSide] = useState(defaultValue.side ?? "");

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
            maxLength={LOAD_MAX_LENGTH}
            placeholder={t("loadPlaceholder")}
            defaultValue={defaultValue.load ?? ""}
          />
          {message("load")}
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor={`${id}-side`}>{t("side")}</Label>
          <input type="hidden" name="side" value={side} />
          <Select
            value={toSelectValue(side)}
            onValueChange={(next) => next && setSide(fromSelectValue(next))}
          >
            <SelectTrigger
              id={`${id}-side`}
              aria-invalid={errors.side !== undefined}
              aria-describedby={errors.side ? `${id}-side-error` : undefined}
              className="w-full"
            >
              <SelectValue>
                {PRESCRIPTION_SIDES.find((option) => option === side)
                  ? t(`sides.${side as (typeof PRESCRIPTION_SIDES)[number]}`)
                  : t("sideNone")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value={toSelectValue("")}>{t("sideNone")}</SelectItem>
              {PRESCRIPTION_SIDES.map((option) => (
                <SelectItem key={option} value={option}>
                  {t(`sides.${option}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {message("side")}
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-notes`}>{t("notes")}</Label>
        <Textarea
          {...field("notes")}
          rows={2}
          maxLength={PRESCRIPTION_NOTES_MAX_LENGTH}
          defaultValue={defaultValue.notes ?? ""}
        />
        {message("notes")}
      </div>
    </fieldset>
  );
}
