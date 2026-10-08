"use client";

import { ChevronDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { categoriesInTreeOrder, withCategory, type CategoryNode } from "@/lib/category-tree";
import { MAX_CATEGORIES_PER_EXERCISE } from "@/lib/library-limits";

import { NewCategoryDialog, type CreatedCategory } from "./new-category-dialog";

/**
 * Category picker for an exercise: any number of categories, top-level or sub-categories (ticking
 * a sub-category leaves its parent alone). A checklist grouped by top-level category, with a
 * "New category" dialog beside it that ticks what it creates. Submits one `name` per category.
 */
export function CategoryMultiSelect({
  id,
  name,
  categories: serverCategories,
  defaultValue,
  invalid,
  describedBy,
}: {
  id: string;
  name: string;
  categories: CategoryNode[];
  defaultValue: string[];
  invalid?: boolean;
  describedBy?: string;
}) {
  const t = useTranslations("Library.form");
  // Categories made in the dialog show at once; the refreshed tree from the server (the action
  // revalidates the library) then already contains them, and withCategory skips the duplicates.
  const [created, setCreated] = useState<CreatedCategory[]>([]);
  const categories = created.reduce(withCategory, serverCategories);
  const all = categoriesInTreeOrder(categories);
  // Saved categories deleted since are dropped.
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => {
    const known = new Set(all.map((category) => category.id));
    return new Set(defaultValue.filter((value) => known.has(value)));
  });
  const selected = all.filter((category) => chosen.has(category.id));
  const full = selected.length >= MAX_CATEGORIES_PER_EXERCISE;

  const label = (category: { name: string; parent: string | null }) =>
    category.parent
      ? t("subcategoryOption", { parent: category.parent, name: category.name })
      : category.name;
  const toggle = (categoryId: string, on: boolean) =>
    setChosen((current) => {
      const next = new Set(current);
      if (on) next.add(categoryId);
      else next.delete(categoryId);
      return next;
    });
  const option = (category: { id: string; name: string; parent: string | null }) => {
    const optionId = `${id}-${category.id}`;
    const checked = chosen.has(category.id);
    return (
      <div
        key={category.id}
        className={category.parent ? "flex items-center gap-2 pl-6" : "flex items-center gap-2"}
      >
        <Checkbox
          id={optionId}
          checked={checked}
          disabled={!checked && full}
          onCheckedChange={(value) => toggle(category.id, value === true)}
        />
        <Label htmlFor={optionId} className="font-normal">
          {label(category)}
        </Label>
      </div>
    );
  };

  return (
    <>
      {selected.map((category) => (
        <input key={category.id} type="hidden" name={name} value={category.id} />
      ))}
      <div className="flex gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              id={id}
              type="button"
              variant="outline"
              aria-invalid={invalid}
              aria-describedby={describedBy}
              className="min-w-0 flex-1 justify-between font-normal"
            >
              <span className="truncate">
                {selected.length > 0 ? selected.map(label).join(", ") : t("uncategorised")}
              </span>
              <ChevronDownIcon aria-hidden className="text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="sm:max-h-96 sm:w-80 sm:overflow-y-auto">
            <PopoverTitle>{t("categoriesTitle")}</PopoverTitle>
            <p className="text-muted-foreground">{t("categoriesHint")}</p>
            <div className="grid gap-3">
              {categories.map((node) => (
                <div key={node.id} role="group" aria-label={node.name} className="grid gap-2">
                  {option({ id: node.id, name: node.name, parent: null })}
                  {node.children.map((child) =>
                    option({ id: child.id, name: child.name, parent: node.name }),
                  )}
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <NewCategoryDialog
          parents={categories}
          onCreated={(category) => {
            setCreated((current) => [...current, category]);
            toggle(category.id, true);
          }}
        />
      </div>
    </>
  );
}
