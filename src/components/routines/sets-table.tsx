"use client";

import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { durationToInput, metersToKmInput, parseDurationInput, parseKm } from "@/lib/distance";
import {
  INTENSITY_MAX_LENGTH,
  LOAD_MAX_LENGTH,
  PRESCRIPTION_LIMITS,
  setSchema,
  setShape,
  type PrescriptionErrorCode,
} from "@/lib/prescription";
import {
  addSet,
  canAddSet,
  canRemoveSet,
  removeSet,
  updateSet,
  type EditorBlock,
  type EditorItem,
  type EditorSet,
  type NewKey,
} from "@/lib/routine-editor";
import { MAX_SETS } from "@/lib/routines";

import { NumberField } from "./number-field";
import { UnitField } from "./unit-field";

/** A rep range needs reps and a max above them; surfaced under the max field. */
function rangeError(set: EditorSet): PrescriptionErrorCode | null {
  const issue = setSchema.safeParse(set).error?.issues.find((i) => i.path[0] === "repsMax");
  return (issue?.message as PrescriptionErrorCode | undefined) ?? null;
}

/** A duration of zero is rejected by the schema (min 1), so it counts as invalid text here. */
const parseMinutes = (text: string) => {
  const seconds = parseDurationInput(text);
  return seconds !== undefined && seconds !== null && seconds <= 0 ? undefined : seconds;
};

/**
 * One row per set (reps, max reps, duration, load; duration, distance and intensity for an
 * aerobic exercise). In a superset every member keeps the same set
 * count, so adding or removing a set applies to all of them.
 */
export function SetsTable({
  blocks,
  item,
  grouped,
  onChange,
  newKey,
}: {
  blocks: EditorBlock[];
  item: EditorItem;
  grouped: boolean;
  onChange: (next: (blocks: EditorBlock[]) => EditorBlock[]) => void;
  newKey: NewKey;
}) {
  const t = useTranslations("Routines.items.sets");
  const loadPlaceholder = useTranslations("Prescription")("loadPlaceholder");
  const aerobic = item.exerciseKind === "aerobic";

  const canAdd = canAddSet(blocks, item.key);
  const canRemove = canRemoveSet(blocks, item.key);
  const patch = (setKey: string, values: Partial<EditorSet>) =>
    onChange((current) => updateSet(current, item.key, setKey, values));

  return (
    <div className="grid min-w-0 gap-2">
      <h4 className="text-sm font-medium">{t("title")}</h4>
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full border-separate border-spacing-x-1 border-spacing-y-1.5 text-left">
          <thead>
            <tr className="text-muted-foreground text-xs">
              <th scope="col" className="w-6 font-normal">
                <span className="sr-only">{t("title")}</span>
              </th>
              {aerobic ? (
                <>
                  <th scope="col" className="min-w-24 font-normal">
                    {t("durationMinutes")}
                  </th>
                  <th scope="col" className="min-w-24 font-normal">
                    {t("distance")}
                  </th>
                  <th scope="col" className="min-w-32 font-normal">
                    {t("intensity")}
                  </th>
                </>
              ) : (
                <>
                  <th scope="col" className="min-w-16 font-normal">
                    {t("reps")}
                  </th>
                  <th scope="col" className="min-w-16 font-normal">
                    {t("repsMax")}
                  </th>
                  <th scope="col" className="min-w-20 font-normal">
                    {t("duration")}
                  </th>
                  <th scope="col" className="min-w-28 font-normal">
                    {t("load")}
                  </th>
                </>
              )}
              <th scope="col" className="w-8 font-normal" />
            </tr>
          </thead>
          <tbody>
            {item.sets.map((set, index) => {
              const n = index + 1;
              const name = (column: string) => `${t("set", { n })}: ${column}`;
              return (
                <tr key={set.key} className="align-top">
                  <td className="text-muted-foreground pt-1.5 text-xs tabular-nums">{n}</td>
                  {aerobic ? (
                    <>
                      <td>
                        <UnitField
                          aria-label={name(t("durationMinutes"))}
                          inputMode="numeric"
                          placeholder={t("durationHint")}
                          value={set.durationSeconds}
                          parse={parseMinutes}
                          format={durationToInput}
                          errorCode="notADuration"
                          onValueChange={(durationSeconds) => patch(set.key, { durationSeconds })}
                        />
                      </td>
                      <td>
                        <UnitField
                          aria-label={name(t("distance"))}
                          inputMode="decimal"
                          placeholder={t("distanceHint")}
                          value={set.distanceMeters}
                          parse={parseKm}
                          format={metersToKmInput}
                          errorCode="notADistance"
                          onValueChange={(distanceMeters) => patch(set.key, { distanceMeters })}
                        />
                      </td>
                      <td>
                        <Input
                          aria-label={name(t("intensity"))}
                          value={set.intensity ?? ""}
                          maxLength={INTENSITY_MAX_LENGTH}
                          placeholder={t("intensityPlaceholder")}
                          onChange={(event) =>
                            patch(set.key, {
                              intensity: event.target.value.trim() ? event.target.value : null,
                            })
                          }
                        />
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        <NumberField
                          aria-label={name(t("reps"))}
                          value={set.reps}
                          schema={setShape.reps}
                          limits={PRESCRIPTION_LIMITS.reps}
                          onValueChange={(reps) => patch(set.key, { reps })}
                        />
                      </td>
                      <td>
                        <NumberField
                          aria-label={name(t("repsMax"))}
                          value={set.repsMax}
                          schema={setShape.repsMax}
                          limits={PRESCRIPTION_LIMITS.repsMax}
                          extraError={rangeError(set)}
                          onValueChange={(repsMax) => patch(set.key, { repsMax })}
                        />
                      </td>
                      <td>
                        <NumberField
                          aria-label={name(t("duration"))}
                          value={set.durationSeconds}
                          schema={setShape.durationSeconds}
                          limits={PRESCRIPTION_LIMITS.durationSeconds}
                          onValueChange={(durationSeconds) => patch(set.key, { durationSeconds })}
                        />
                      </td>
                      <td>
                        <Input
                          aria-label={name(t("load"))}
                          value={set.load ?? ""}
                          maxLength={LOAD_MAX_LENGTH}
                          placeholder={loadPlaceholder}
                          onChange={(event) =>
                            patch(set.key, {
                              load: event.target.value.trim() ? event.target.value : null,
                            })
                          }
                        />
                      </td>
                    </>
                  )}
                  <td>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("remove", { n })}
                      disabled={!canRemove}
                      onClick={() => onChange((current) => removeSet(current, item.key, set.key))}
                    >
                      <XIcon aria-hidden />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canAdd}
          onClick={() => onChange((current) => addSet(current, item.key, newKey))}
        >
          {t("add")}
        </Button>
        {!canAdd ? (
          <p className="text-muted-foreground text-xs">{t("limit", { max: MAX_SETS })}</p>
        ) : null}
        {grouped ? <p className="text-muted-foreground text-xs">{t("syncHint")}</p> : null}
      </div>
    </div>
  );
}
