import { useTranslations } from "next-intl";

import { selectClassName } from "@/components/prescription/prescription-fields";
import type { CategoryNode } from "@/lib/category-tree";

/** Native category picker: Uncategorised, then one group per top-level category. */
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
  return (
    <select
      id={id}
      name={name}
      defaultValue={defaultValue ?? ""}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      className={selectClassName}
    >
      <option value="">{t("uncategorised")}</option>
      {categories.map((category) => (
        <optgroup key={category.id} label={category.name}>
          <option value={category.id}>{category.name}</option>
          {category.children.map((child) => (
            <option key={child.id} value={child.id}>
              {t("subcategoryOption", { parent: category.name, name: child.name })}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
