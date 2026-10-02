"use client";

import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CategoryNode } from "@/lib/category-tree";
import { CATEGORY_NAME_MAX_LENGTH } from "@/lib/library-limits";
import { fromSelectValue, toSelectValue } from "@/lib/select-value";
import { createCategoryAction } from "@/server/library/actions";

import { categoryErrorKey, useCategoryErrorText, type CategoryErrorKey } from "./category-errors";

export type CreatedCategory = { id: string; name: string; parentId: string | null };

/** Where each error is shown: the name field, the parent field or below both. */
const FIELD_OF: Record<CategoryErrorKey, "name" | "parent" | "form"> = {
  nameRequired: "name",
  nameTooLong: "name",
  nameTaken: "name",
  notFound: "parent",
  tooDeep: "parent",
  unknown: "form",
};

/**
 * "New category" beside the exercise form's category picker: creates a category (optionally
 * inside a top-level one) without leaving the form, and hands it back to be selected.
 */
export function NewCategoryDialog({
  parents,
  onCreated,
}: {
  /** Top-level categories (sub-categories cannot have children). */
  parents: CategoryNode[];
  onCreated: (category: CreatedCategory) => void;
}) {
  const t = useTranslations("Library.form.newCategory");
  const [open, setOpen] = useState(false);
  // A fresh form (empty name, no error) every time the dialog opens.
  const [formKey, setFormKey] = useState(0);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setFormKey((key) => key + 1);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="shrink-0">
          <PlusIcon aria-hidden />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <NewCategoryForm
          key={formKey}
          parents={parents}
          onCreated={(category) => {
            onCreated(category);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function NewCategoryForm({
  parents,
  onCreated,
}: {
  parents: CategoryNode[];
  onCreated: (category: CreatedCategory) => void;
}) {
  const t = useTranslations("Library.form.newCategory");
  const tCategories = useTranslations("Library.categories");
  const errorText = useCategoryErrorText();
  const id = useId();
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [error, setError] = useState<CategoryErrorKey | null>(null);
  const [pending, startTransition] = useTransition();
  const field = error ? FIELD_OF[error] : null;
  const errorId = `${id}-error`;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The dialog is portalled out of the exercise form in the DOM but not in React's tree, so
    // without this the submit event would bubble to the exercise form and save the exercise.
    event.stopPropagation();
    setError(null);
    startTransition(async () => {
      const input = { name, parentId: parentId || null };
      try {
        const result = await createCategoryAction(input);
        if (result.ok) {
          onCreated({ id: result.data.id, name: name.trim(), parentId: input.parentId });
        } else {
          setError(categoryErrorKey(result.error));
        }
      } catch {
        setError("unknown");
      }
    });
  }

  const message = (where: "name" | "parent" | "form") =>
    error && field === where ? (
      <p id={errorId} role="alert" className="text-destructive text-sm">
        {errorText(error)}
      </p>
    ) : null;

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor={`${id}-name`}>{tCategories("nameLabel")}</Label>
        <Input
          id={`${id}-name`}
          value={name}
          maxLength={CATEGORY_NAME_MAX_LENGTH}
          autoFocus
          autoComplete="off"
          aria-invalid={field === "name" ? true : undefined}
          aria-describedby={field === "name" ? errorId : undefined}
          onChange={(event) => setName(event.target.value)}
        />
        {message("name")}
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-parent`}>{t("parent")}</Label>
        {/* Read from state on submit, so no hidden input: nothing here posts with a form. */}
        <Select
          value={toSelectValue(parentId)}
          onValueChange={(next) => next && setParentId(fromSelectValue(next))}
        >
          <SelectTrigger
            id={`${id}-parent`}
            aria-invalid={field === "parent" ? true : undefined}
            aria-describedby={field === "parent" ? errorId : undefined}
            className="w-full"
          >
            <SelectValue>
              {parents.find((parent) => parent.id === parentId)?.name ?? t("noParent")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value={toSelectValue("")}>{t("noParent")}</SelectItem>
            {parents.map((parent) => (
              <SelectItem key={parent.id} value={parent.id}>
                {parent.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {message("parent")}
      </div>
      {message("form")}
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
  );
}
