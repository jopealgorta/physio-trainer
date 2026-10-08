"use client";

import { useTranslations } from "next-intl";

import { ExerciseForm } from "@/components/library/exercise-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerNested,
  DrawerTitle,
} from "@/components/ui/drawer";
import type { BodyArea } from "@/lib/body-areas";
import type { CategoryNode } from "@/lib/category-tree";
import type { ExerciseRef } from "@/lib/routine-editor";
import { createExerciseForRoutineAction } from "@/server/library/actions";
import type { ExerciseFormState } from "@/server/library/schemas";

export type NewExerciseStart = { name: string; categoryIds: string[]; bodyAreas: BodyArea[] };

/**
 * The library's exercise form, opened from the routine editor's picker. The exercise is saved to
 * the library like any other and handed to `onCreated`, which adds it to the routine. Inside the
 * picker's bottom sheet it is a nested sheet; beside the editor it is a dialog. Closing unmounts
 * the form, so each opening starts fresh. Neither scroller pads its bottom: the form's pinned
 * submit row does, and it would otherwise stop short of the edge.
 */
export function CreateExerciseDialog({
  open,
  onOpenChange,
  start,
  categories,
  nested,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the form starts with: the picker's search text and filters. */
  start: NewExerciseStart;
  categories: CategoryNode[];
  /** Rendered inside a `Drawer`: open as a nested sheet rather than a dialog. */
  nested: boolean;
  onCreated: (exercise: ExerciseRef) => void;
}) {
  const t = useTranslations("Routines.picker");

  async function action(state: ExerciseFormState, formData: FormData) {
    const result = await createExerciseForRoutineAction(state, formData);
    if (result.status === "created") onCreated(result.exercise);
    return result;
  }

  const form = (
    <ExerciseForm
      compact
      action={action}
      categories={categories}
      submitLabel={t("createSubmit")}
      defaults={{ ...start, kind: "strength", instructions: null, mediaUrls: [] }}
    />
  );

  if (nested) {
    return (
      <DrawerNested open={open} onOpenChange={onOpenChange}>
        <DrawerContent focusContent>
          <DrawerHeader>
            <DrawerTitle>{t("createTitle")}</DrawerTitle>
            <DrawerDescription>{t("createDescription")}</DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6">{form}</div>
        </DrawerContent>
      </DrawerNested>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto p-6 pb-0 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
          <DialogDescription>{t("createDescription")}</DialogDescription>
        </DialogHeader>
        {form}
      </DialogContent>
    </Dialog>
  );
}
