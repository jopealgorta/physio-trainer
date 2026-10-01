"use client";

import { CopyPlusIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition, type FormEvent } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  nextPhaseDefaults,
  nextPhaseNumber,
  PHASE_LABEL_MAX,
  previewNextPhase,
  validateWindow,
} from "@/lib/phases";
import type { RoutineStatus } from "@/lib/routines";
import { copyIntoNextPhaseAction } from "@/server/phases/actions";
import type { PhaseActionError, PhaseKind } from "@/server/phases/schemas";

type CopyError = PhaseActionError | "generic";

/**
 * "Copy into next phase": clones the routine or plan, links it to this one and schedules it. The
 * defaults follow spec 08 (label "Phase N+1", start the day after this one ends, end the current
 * phase the day before). Opens the new item once created.
 */
export function NextPhaseDialog({
  kind,
  id,
  status,
  phaseLabel,
  startsOn,
  endsOn,
  today,
}: {
  kind: PhaseKind;
  id: string;
  status: RoutineStatus;
  phaseLabel: string | null;
  startsOn: string | null;
  endsOn: string | null;
  /** The physio's calendar day (`YYYY-MM-DD`), for the default start. */
  today: string;
}) {
  const t = useTranslations("Phases.next");
  const tErrors = useTranslations("Phases.errors");
  const router = useRouter();
  const fieldId = useId();
  const defaults = useMemo(() => nextPhaseDefaults({ endsOn }, today), [endsOn, today]);
  const defaultLabel = t("defaultLabel", { number: nextPhaseNumber(phaseLabel) });

  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(defaultLabel);
  const [start, setStart] = useState(defaults.startsOn);
  const [end, setEnd] = useState("");
  const [endCurrent, setEndCurrent] = useState(defaults.endCurrent);
  const [error, setError] = useState<CopyError | null>(null);
  const [pending, startTransition] = useTransition();

  const preview = previewNextPhase({
    current: { status, startsOn, endsOn },
    next: { startsOn: start || null, endsOn: end || null },
    endCurrent,
  });

  function onOpenChange(next: boolean) {
    if (next) {
      setLabel(defaultLabel);
      setStart(defaults.startsOn);
      setEnd("");
      setEndCurrent(defaults.endCurrent);
      setError(null);
    }
    setOpen(next);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const problem =
      start === "" ? "startsInvalid" : validateWindow({ startsOn: start, endsOn: end || null });
    if (problem) return setError(problem);
    if (preview.error) return setError(preview.error);
    setError(null);
    startTransition(async () => {
      try {
        const result = await copyIntoNextPhaseAction({
          kind,
          id,
          phaseLabel: label,
          startsOn: start,
          endsOn: end,
          endCurrent,
        });
        if (result.ok) {
          setOpen(false);
          router.push(
            kind === "routine" ? `/routines/${result.data.id}` : `/plans/${result.data.id}`,
          );
        } else {
          setError(result.error);
        }
      } catch {
        setError("generic");
      }
    });
  }

  const shownError = error ?? preview.error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <CopyPlusIcon aria-hidden /> {t("button")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t(kind === "routine" ? "titleRoutine" : "titlePlan")}</DialogTitle>
            <DialogDescription>
              {t(kind === "routine" ? "descriptionRoutine" : "descriptionPlan")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={`${fieldId}-label`}>{t("label")}</Label>
            <Input
              id={`${fieldId}-label`}
              value={label}
              maxLength={PHASE_LABEL_MAX}
              autoComplete="off"
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={`${fieldId}-starts`}>{t("startsOn")}</Label>
              <Input
                id={`${fieldId}-starts`}
                type="date"
                value={start}
                required
                aria-invalid={error === "startsInvalid" || shownError === "startBeforePredecessor"}
                onChange={(event) => setStart(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${fieldId}-ends`}>{t("endsOn")}</Label>
              <Input
                id={`${fieldId}-ends`}
                type="date"
                value={end}
                aria-invalid={error === "endsInvalid" || error === "endBeforeStart"}
                onChange={(event) => setEnd(event.target.value)}
              />
            </div>
          </div>
          {status === "active" ? (
            <div className="flex items-start gap-2">
              <Checkbox
                id={`${fieldId}-end-current`}
                checked={endCurrent}
                onCheckedChange={(checked) => setEndCurrent(checked === true)}
              />
              <Label htmlFor={`${fieldId}-end-current`} className="leading-snug">
                {t("endCurrent")}
              </Label>
            </div>
          ) : null}
          {preview.overlaps && !shownError ? (
            <Alert>
              <TriangleAlertIcon aria-hidden />
              <AlertDescription>{t("overlap")}</AlertDescription>
            </Alert>
          ) : null}
          {shownError ? (
            <Alert variant="destructive">
              <AlertDescription>{tErrors(shownError, { max: PHASE_LABEL_MAX })}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? t("creating") : t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
