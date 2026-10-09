"use client";

import { useTranslations } from "next-intl";
import { startTransition, useActionState, useId, type FormEvent } from "react";

import { BodyAreaPicker } from "@/components/body-areas/body-area-picker";
import { Field, FieldRow, FormBody, FormCancel, FormFooter } from "@/components/form-layout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
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
  submitLabel,
  cancel,
  returnTo,
  compact = false,
}: {
  action: (state: ExerciseFormState, formData: FormData) => Promise<ExerciseFormState>;
  defaults: ExerciseFormValues;
  categories: CategoryNode[];
  /** Replaces "Create exercise" / "Save changes". */
  submitLabel?: string;
  /** Where Cancel goes (a page), or what it does (a dialog closes). */
  cancel: { href: string } | { onClick: () => void };
  /** Where saving lands (the page it was opened from); the action validates it. */
  returnTo?: string;
  /** In a dialog: the full dialog width, and the footer pinned to the dialog's scroll area. */
  compact?: boolean;
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
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-6">
      {editing ? <input type="hidden" name="id" value={defaults.id} /> : null}
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <FormBody className={cn(compact && "max-w-none")}>
        <FieldRow>
          <Field>
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
          </Field>

          <Field>
            <Label id={`${id}-kind`}>{t("kind.label")}</Label>
            <RadioGroup
              name="kind"
              defaultValue={defaults.kind}
              aria-labelledby={`${id}-kind`}
              className="flex min-h-9 w-auto flex-wrap items-center gap-4"
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
          </Field>
        </FieldRow>

        <FieldRow>
          <Field>
            <Label id={`${id}-category-label`} htmlFor={`${id}-category`}>
              {t("categories")}
            </Label>
            <CategoryMultiSelect
              id={`${id}-category`}
              labelId={`${id}-category-label`}
              name="categoryIds"
              categories={categories}
              defaultValue={defaults.categoryIds}
              invalid={errors.categoryIds !== undefined}
              describedBy={errors.categoryIds ? errorId("categoryIds") : undefined}
            />
            {errorText("categoryIds")}
          </Field>

          <Field>
            <BodyAreaPicker
              mode="multi"
              name="bodyAreas"
              label={t("bodyAreas")}
              defaultValue={defaults.bodyAreas}
              invalid={errors.bodyAreas !== undefined}
              describedBy={errors.bodyAreas ? errorId("bodyAreas") : undefined}
            />
            {errorText("bodyAreas")}
          </Field>
        </FieldRow>

        <Field>
          <Label htmlFor={`${id}-instructions`}>{t("instructions")}</Label>
          <Textarea
            id={`${id}-instructions`}
            name="instructions"
            rows={5}
            defaultValue={defaults.instructions ?? ""}
            maxLength={INSTRUCTIONS_MAX_LENGTH}
            aria-invalid={errors.instructions !== undefined}
            aria-describedby={`${id}-instructions-hint${errors.instructions ? ` ${errorId("instructions")}` : ""}`}
          />
          <p id={`${id}-instructions-hint`} className="text-muted-foreground text-sm">
            {t("instructionsHint")}
          </p>
          {errorText("instructions")}
        </Field>

        <section className="grid gap-3">
          <h2 className="text-sm font-medium">{t("media")}</h2>
          <MediaListEditor
            defaultValue={defaults.mediaUrls}
            title={defaults.name || t("newTitle")}
          />
          {errorText("media")}
        </section>

        {state.status === "error" && state.formError ? (
          <Alert variant="destructive">
            <AlertDescription>{t(`errors.${state.formError}`)}</AlertDescription>
          </Alert>
        ) : null}
      </FormBody>

      <FormFooter variant={compact ? "panel" : "page"}>
        <FormCancel {...cancel} />
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : (submitLabel ?? t(editing ? "save" : "create"))}
        </Button>
      </FormFooter>
    </form>
  );
}
