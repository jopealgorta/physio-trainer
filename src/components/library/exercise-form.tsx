"use client";

import { useTranslations } from "next-intl";
import { startTransition, useActionState, useId, type FormEvent } from "react";

import { BodyAreaPicker } from "@/components/body-areas/body-area-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { BodyArea } from "@/lib/body-areas";
import type { CategoryNode } from "@/lib/category-tree";
import { EXERCISE_KINDS, type ExerciseKind } from "@/lib/exercise-kinds";
import {
  EXERCISE_NAME_MAX_LENGTH,
  INSTRUCTIONS_MAX_LENGTH,
  MAX_CATEGORIES_PER_EXERCISE,
  MAX_MEDIA,
} from "@/lib/library-limits";
import type { ExerciseFieldErrors, ExerciseFormState } from "@/server/library/schemas";

import { CategoryMultiSelect } from "./category-multi-select";
import { MediaListEditor } from "./media-list-editor";

export type ExerciseFormValues = {
  id?: string;
  name: string;
  kind: ExerciseKind;
  categoryIds: string[];
  instructions: string | null;
  bodyAreas: BodyArea[];
  mediaUrls: string[];
};

const initialState: ExerciseFormState = { status: "idle" };

const FORM_ERROR_CODES = [
  "nameRequired",
  "nameTooLong",
  "categoryInvalid",
  "tooManyCategories",
  "instructionsTooLong",
  "bodyAreasInvalid",
  "tooManyMedia",
  "mediaInvalid",
  "invalid",
] as const;

type FieldWithMessage = "name" | "categoryIds" | "instructions" | "bodyAreas" | "media";

const MAX_BY_FIELD: Record<FieldWithMessage, number> = {
  categoryIds: MAX_CATEGORIES_PER_EXERCISE,
  bodyAreas: 0,
  name: EXERCISE_NAME_MAX_LENGTH,
  instructions: INSTRUCTIONS_MAX_LENGTH,
  media: MAX_MEDIA,
};

export function ExerciseForm({
  action,
  defaults,
  categories,
}: {
  action: (state: ExerciseFormState, formData: FormData) => Promise<ExerciseFormState>;
  defaults: ExerciseFormValues;
  categories: CategoryNode[];
}) {
  const t = useTranslations("Library.form");
  const [state, formAction, pending] = useActionState(action, initialState);
  const id = useId();
  const editing = defaults.id !== undefined;

  const errors: ExerciseFieldErrors = state.status === "error" ? state.fieldErrors : {};

  const message = (field: FieldWithMessage) => {
    const code = errors[field];
    if (!code) return null;
    const known = FORM_ERROR_CODES.find((candidate) => candidate === code) ?? "invalid";
    return t(`errors.${known}`, { max: MAX_BY_FIELD[field] });
  };
  const errorId = (field: string) => `${id}-${field}-error`;
  const errorText = (field: FieldWithMessage) => {
    const text = message(field);
    return text ? (
      <p id={errorId(field)} className="text-destructive text-sm">
        {text}
      </p>
    ) : null;
  };

  // React resets a form after its `action` resolves, wiping typed values. Dispatching from
  // onSubmit skips that reset; `action` stays for submits before hydration.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-8">
      {editing ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid content-start gap-6">
          <div className="grid gap-2">
            <Label htmlFor={`${id}-name`}>{t("name")}</Label>
            <Input
              id={`${id}-name`}
              name="name"
              defaultValue={defaults.name}
              maxLength={EXERCISE_NAME_MAX_LENGTH}
              required
              aria-invalid={errors.name !== undefined}
              aria-describedby={errors.name ? errorId("name") : undefined}
            />
            {errorText("name")}
          </div>

          <div className="grid gap-2">
            <Label id={`${id}-kind`}>{t("kind.label")}</Label>
            <RadioGroup
              name="kind"
              defaultValue={defaults.kind}
              aria-labelledby={`${id}-kind`}
              className="flex w-auto flex-wrap gap-4"
            >
              {EXERCISE_KINDS.map((kind) => (
                <div key={kind} className="flex items-center gap-2">
                  <RadioGroupItem id={`${id}-kind-${kind}`} value={kind} />
                  <Label htmlFor={`${id}-kind-${kind}`} className="font-normal">
                    {t(`kind.${kind}`)}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${id}-category`}>{t("category")}</Label>
            <CategoryMultiSelect
              id={`${id}-category`}
              name="categoryIds"
              categories={categories}
              defaultValue={defaults.categoryIds}
              invalid={errors.categoryIds !== undefined}
              describedBy={errors.categoryIds ? errorId("categoryIds") : undefined}
            />
            {errorText("categoryIds")}
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${id}-instructions`}>{t("instructions")}</Label>
            <Textarea
              id={`${id}-instructions`}
              name="instructions"
              rows={6}
              defaultValue={defaults.instructions ?? ""}
              maxLength={INSTRUCTIONS_MAX_LENGTH}
              aria-invalid={errors.instructions !== undefined}
              aria-describedby={`${id}-instructions-hint${errors.instructions ? ` ${errorId("instructions")}` : ""}`}
            />
            <p id={`${id}-instructions-hint`} className="text-muted-foreground text-sm">
              {t("instructionsHint")}
            </p>
            {errorText("instructions")}
          </div>
        </div>

        <div className="grid content-start gap-2">
          <div className="w-full max-w-80">
            <BodyAreaPicker
              mode="multi"
              name="bodyAreas"
              label={t("bodyAreas")}
              defaultValue={defaults.bodyAreas}
            />
          </div>
          {errorText("bodyAreas")}
        </div>
      </div>

      <section className="grid gap-3">
        <h2 className="text-base font-medium">{t("media")}</h2>
        <MediaListEditor defaultValue={defaults.mediaUrls} title={defaults.name || t("newTitle")} />
        {errorText("media")}
      </section>

      {state.status === "error" && state.formError ? (
        <Alert variant="destructive">
          <AlertDescription>{t(`errors.${state.formError}`)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t(editing ? "save" : "create")}
        </Button>
        {state.status === "saved" && !pending ? (
          <p role="status" className="text-muted-foreground text-sm">
            {t("saved")}
          </p>
        ) : null}
      </div>
    </form>
  );
}
