"use client";

import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ENTRY_LABEL_MAX } from "@/lib/plans";
import type { AttachableRoutine } from "@/server/plans/queries";

/** Edit (or clear) an entry's label. Blank saves as no label. */
export function EntryLabelDialog({
  open,
  onOpenChange,
  routineName,
  initialLabel,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  routineName: string;
  initialLabel: string | null;
  onSave: (label: string | null) => void;
}) {
  const t = useTranslations("Plans.board.labelDialog");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { routine: routineName })}</DialogTitle>
        </DialogHeader>
        {/* Remounts on every open so the box starts from the saved label. */}
        {open ? (
          <LabelForm
            initialLabel={initialLabel ?? ""}
            onSave={(label) => {
              onSave(label.trim() === "" ? null : label.trim());
              onOpenChange(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function LabelForm({
  initialLabel,
  onSave,
}: {
  initialLabel: string;
  onSave: (label: string) => void;
}) {
  const t = useTranslations("Plans.board.labelDialog");
  const id = useId();
  const [label, setLabel] = useState(initialLabel);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    onSave(label);
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor={`${id}-label`}>{t("label")}</Label>
        <Input
          id={`${id}-label`}
          value={label}
          maxLength={ENTRY_LABEL_MAX}
          autoComplete="off"
          onChange={(event) => setLabel(event.target.value)}
          aria-describedby={`${id}-hint`}
        />
        <p id={`${id}-hint`} className="text-muted-foreground text-xs">
          {t("hint")}
        </p>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            {t("cancel")}
          </Button>
        </DialogClose>
        <Button type="button" variant="outline" onClick={() => onSave("")}>
          {t("clear")}
        </Button>
        <Button type="submit">{t("save")}</Button>
      </DialogFooter>
    </form>
  );
}

/** Pick one of the customer's routines to add to a day, with an optional label. */
export function AttachRoutineDialog({
  open,
  onOpenChange,
  dayName,
  routines,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dayName: string;
  routines: AttachableRoutine[];
  onAdd: (input: { routineId: string; label: string | null; standalone?: boolean }) => void;
}) {
  const t = useTranslations("Plans.board.attach");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { day: dayName })}</DialogTitle>
        </DialogHeader>
        {open ? (
          <AttachForm
            routines={routines}
            onAdd={(input) => {
              onAdd(input);
              onOpenChange(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AttachForm({
  routines,
  onAdd,
}: {
  routines: AttachableRoutine[];
  onAdd: (input: { routineId: string; label: string | null; standalone?: boolean }) => void;
}) {
  const t = useTranslations("Plans.board.attach");
  const id = useId();
  const [routineId, setRoutineId] = useState("");
  const [label, setLabel] = useState("");
  const [standalone, setStandalone] = useState(true);
  const chosen = routines.find((routine) => routine.id === routineId);

  if (routines.length === 0) {
    return (
      <div className="grid gap-4">
        <p className="text-muted-foreground text-sm">{t("none")}</p>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {t("cancel")}
            </Button>
          </DialogClose>
        </DialogFooter>
      </div>
    );
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!chosen) return;
    onAdd({
      routineId: chosen.id,
      label: label.trim() === "" ? null : label.trim(),
      // Only send the flag when the physio changed what the routine already has.
      ...(standalone !== chosen.isStandalone ? { standalone } : {}),
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor={`${id}-routine`}>{t("routine")}</Label>
        <Select
          value={routineId}
          onValueChange={(next) => {
            // "" only comes from Radix's internal <select>, never from a choice (see select-value).
            if (next === "") return;
            setRoutineId(next);
            setStandalone(routines.find((routine) => routine.id === next)?.isStandalone ?? true);
          }}
        >
          <SelectTrigger id={`${id}-routine`} className="w-full">
            <SelectValue placeholder={t("choose")}>{chosen?.name}</SelectValue>
          </SelectTrigger>
          <SelectContent position="popper">
            {routines.map((routine) => (
              <SelectItem key={routine.id} value={routine.id}>
                {routine.name} · {t("meta", { count: routine.itemCount })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-label`}>{t("label")}</Label>
        <Input
          id={`${id}-label`}
          value={label}
          maxLength={ENTRY_LABEL_MAX}
          autoComplete="off"
          onChange={(event) => setLabel(event.target.value)}
          aria-describedby={`${id}-label-hint`}
        />
        <p id={`${id}-label-hint`} className="text-muted-foreground text-xs">
          {t("labelHint")}
        </p>
      </div>
      <div className="flex items-start gap-2">
        <Checkbox
          id={`${id}-standalone`}
          checked={standalone}
          disabled={!chosen}
          onCheckedChange={(checked) => setStandalone(checked === true)}
          aria-describedby={`${id}-standalone-hint`}
        />
        <div className="grid gap-0.5">
          <Label htmlFor={`${id}-standalone`} className="font-normal">
            {t("standalone")}
          </Label>
          <p id={`${id}-standalone-hint`} className="text-muted-foreground text-xs">
            {t("standaloneHint")}
          </p>
        </div>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            {t("cancel")}
          </Button>
        </DialogClose>
        <Button type="submit" disabled={!chosen}>
          {t("add")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Removing the last entry of a routine that only exists for the plan asks whether to delete the
 * routine too (rule 3, default yes).
 */
export function RemoveEntryDialog({
  open,
  onOpenChange,
  routineName,
  dayName,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  routineName: string;
  dayName: string;
  onConfirm: (deleteRoutine: boolean) => void;
}) {
  const t = useTranslations("Plans.board.remove");
  const id = useId();
  const [deleteRoutine, setDeleteRoutine] = useState(true);
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (next) setDeleteRoutine(true);
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title", { routine: routineName })}</AlertDialogTitle>
          <AlertDialogDescription>{t("body", { day: dayName })}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-start gap-2">
          <Checkbox
            id={`${id}-delete`}
            checked={deleteRoutine}
            onCheckedChange={(checked) => setDeleteRoutine(checked === true)}
            aria-describedby={`${id}-delete-hint`}
          />
          <div className="grid gap-0.5">
            <Label htmlFor={`${id}-delete`} className="font-normal">
              {t("deleteRoutine")}
            </Label>
            <p id={`${id}-delete-hint`} className="text-muted-foreground text-xs">
              {t("deleteHint")}
            </p>
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          {/* A plain button, not AlertDialogAction: the dialog closes through onOpenChange. */}
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              onConfirm(deleteRoutine);
              onOpenChange(false);
            }}
          >
            {t("confirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
