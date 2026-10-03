"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { withCategory, type CategoryNode } from "@/lib/category-tree";
import { fromSelectValue, toSelectValue } from "@/lib/select-value";

import { NewCategoryDialog, type CreatedCategory } from "./new-category-dialog";

/**
 * Category picker: Uncategorised, then one group per top-level category, with a "New category"
 * dialog beside it that selects what it creates.
 */
export function CategorySelect({
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
  defaultValue: string | null;
  invalid?: boolean;
  describedBy?: string;
}) {
  const t = useTranslations("Library.form");
  // Categories made in the dialog show at once; the refreshed tree from the server (the action
  // revalidates the library) then already contains them, and withCategory skips the duplicates.
  const [created, setCreated] = useState<CreatedCategory[]>([]);
  const categories = created.reduce(withCategory, serverCategories);
  // Trigger text is rendered from these rather than left to Radix, which shows nothing until the
  // client mounts. A default that matches no category (deleted since) falls back to Uncategorised.
  const labels = new Map<string, string>([["", t("uncategorised")]]);
  for (const category of categories) {
    labels.set(category.id, category.name);
    for (const child of category.children) {
      labels.set(child.id, t("subcategoryOption", { parent: category.name, name: child.name }));
    }
  }
  const [value, setValue] = useState(labels.has(defaultValue ?? "") ? (defaultValue ?? "") : "");
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <div className="flex gap-2">
        <Select
          value={toSelectValue(value)}
          onValueChange={(next) => next && setValue(fromSelectValue(next))}
        >
          <SelectTrigger
            id={id}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            className="w-full min-w-0 flex-1"
          >
            <SelectValue>{labels.get(value)}</SelectValue>
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value={toSelectValue("")}>{t("uncategorised")}</SelectItem>
            {categories.map((category) => (
              <SelectGroup key={category.id}>
                <SelectLabel>{category.name}</SelectLabel>
                <SelectItem value={category.id}>{category.name}</SelectItem>
                {category.children.map((child) => (
                  <SelectItem key={child.id} value={child.id}>
                    {t("subcategoryOption", { parent: category.name, name: child.name })}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <NewCategoryDialog
          parents={categories}
          onCreated={(category) => {
            setCreated((current) => [...current, category]);
            setValue(category.id);
          }}
        />
      </div>
    </>
  );
}
