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
import type { CategoryNode } from "@/lib/category-tree";
import { fromSelectValue, toSelectValue } from "@/lib/select-value";

/** Category picker: Uncategorised, then one group per top-level category. */
export function CategorySelect({
  id,
  name,
  categories,
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
      <Select
        value={toSelectValue(value)}
        onValueChange={(next) => next && setValue(fromSelectValue(next))}
      >
        <SelectTrigger
          id={id}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className="w-full"
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
    </>
  );
}
