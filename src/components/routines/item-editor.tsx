"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

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
  itemShape,
  PRESCRIPTION_LIMITS,
  PRESCRIPTION_NOTES_MAX_LENGTH,
  PRESCRIPTION_SIDES,
  type PrescriptionSide,
} from "@/lib/prescription";
import { updateItem, type EditorBlock, type EditorItem, type NewKey } from "@/lib/routine-editor";
import { fromSelectValue, toSelectValue } from "@/lib/select-value";

import { NumberField } from "./number-field";
import { SetsTable } from "./sets-table";

/** The expanded prescription of one exercise: its sets plus hold, rest, side and notes. */
export function ItemEditor({
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
  const t = useTranslations("Routines.items.fields");
  const tPrescription = useTranslations("Prescription");
  const id = useId();

  const patch = (values: Parameters<typeof updateItem>[2]) =>
    onChange((current) => updateItem(current, item.key, values));

  return (
    <div className="grid min-w-0 gap-4">
      <SetsTable
        blocks={blocks}
        item={item}
        grouped={grouped}
        onChange={onChange}
        newKey={newKey}
      />

      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="grid min-w-0 content-start gap-2">
          <Label htmlFor={`${id}-hold`}>{t("hold")}</Label>
          <NumberField
            id={`${id}-hold`}
            value={item.holdSeconds}
            schema={itemShape.holdSeconds}
            limits={PRESCRIPTION_LIMITS.holdSeconds}
            onValueChange={(holdSeconds) => patch({ holdSeconds })}
          />
        </div>

        {grouped ? null : (
          <div className="grid min-w-0 content-start gap-2">
            <Label htmlFor={`${id}-rest`}>{t("rest")}</Label>
            <NumberField
              id={`${id}-rest`}
              value={item.restSeconds}
              schema={itemShape.restSeconds}
              limits={PRESCRIPTION_LIMITS.restSeconds}
              onValueChange={(restSeconds) => patch({ restSeconds })}
            />
          </div>
        )}

        <div className="grid min-w-0 content-start gap-2">
          <Label htmlFor={`${id}-side`}>{t("side")}</Label>
          <Select
            value={toSelectValue(item.side ?? "")}
            onValueChange={(next) => {
              if (next === "") return;
              const side = PRESCRIPTION_SIDES.find(
                (candidate) => candidate === fromSelectValue(next),
              );
              patch({ side: side ?? null });
            }}
          >
            <SelectTrigger id={`${id}-side`} className="w-full">
              <SelectValue>
                {item.side ? tPrescription(`sides.${item.side}`) : tPrescription("sideNone")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value={toSelectValue("")}>{tPrescription("sideNone")}</SelectItem>
              {PRESCRIPTION_SIDES.map((side: PrescriptionSide) => (
                <SelectItem key={side} value={side}>
                  {tPrescription(`sides.${side}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid min-w-0 gap-2">
        <Label htmlFor={`${id}-notes`}>{t("notes")}</Label>
        <Textarea
          id={`${id}-notes`}
          rows={2}
          maxLength={PRESCRIPTION_NOTES_MAX_LENGTH}
          value={item.notes ?? ""}
          onChange={(event) => patch({ notes: event.target.value || null })}
        />
      </div>
    </div>
  );
}
