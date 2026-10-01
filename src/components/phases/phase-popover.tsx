"use client";

import { CalendarRangeIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PHASE_LABEL_MAX, validateWindow } from "@/lib/phases";
import { setPhaseAction } from "@/server/phases/actions";
import type { PhaseActionError, PhaseKind } from "@/server/phases/schemas";

export type PhaseValues = {
  phaseLabel: string | null;
  startsOn: string | null;
  endsOn: string | null;
};

type EditError = PhaseActionError | "generic";

/** Edits an item's phase label and dates. Saves on its own (it is not part of the editor's Save). */
export function PhasePopover({
  kind,
  id,
  values,
}: {
  kind: PhaseKind;
  id: string;
  values: PhaseValues;
}) {
  const t = useTranslations("Phases.edit");
  const tErrors = useTranslations("Phases.errors");
  const router = useRouter();
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [error, setError] = useState<EditError | null>(null);
  const [pending, startTransition] = useTransition();

  const hasPhase = values.phaseLabel !== null || values.startsOn !== null || values.endsOn !== null;

  function onOpenChange(next: boolean) {
    if (next) {
      setLabel(values.phaseLabel ?? "");
      setStartsOn(values.startsOn ?? "");
      setEndsOn(values.endsOn ?? "");
      setError(null);
    }
    setOpen(next);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const window = { startsOn: startsOn || null, endsOn: endsOn || null };
    const problem = validateWindow(window);
    if (problem) return setError(problem);
    setError(null);
    startTransition(async () => {
      try {
        const result = await setPhaseAction({
          kind,
          id,
          phaseLabel: label,
          startsOn,
          endsOn,
        });
        if (result.ok) {
          setOpen(false);
          router.refresh();
        } else {
          setError(result.error);
        }
      } catch {
        setError("generic");
      }
    });
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <CalendarRangeIcon aria-hidden /> {hasPhase ? t("edit") : t("set")}
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <form onSubmit={onSubmit} noValidate className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor={`${fieldId}-label`}>{t("label")}</Label>
            <Input
              id={`${fieldId}-label`}
              value={label}
              maxLength={PHASE_LABEL_MAX}
              placeholder={t("labelPlaceholder")}
              autoComplete="off"
              onChange={(event) => {
                setLabel(event.target.value);
                setError(null);
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${fieldId}-starts`}>{t("startsOn")}</Label>
            <Input
              id={`${fieldId}-starts`}
              type="date"
              value={startsOn}
              aria-invalid={error === "startsInvalid"}
              onChange={(event) => {
                setStartsOn(event.target.value);
                setError(null);
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${fieldId}-ends`}>{t("endsOn")}</Label>
            <Input
              id={`${fieldId}-ends`}
              type="date"
              value={endsOn}
              aria-invalid={error === "endsInvalid" || error === "endBeforeStart"}
              onChange={(event) => {
                setEndsOn(event.target.value);
                setError(null);
              }}
            />
          </div>
          <p className="text-muted-foreground text-xs">{t("hint")}</p>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{tErrors(error, { max: PHASE_LABEL_MAX })}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? t("saving") : t("save")}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
