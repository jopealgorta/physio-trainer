"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { EditableTitle } from "@/components/editable-title";
import { PLAN_NAME_MAX } from "@/lib/plans";
import { renamePlanAction } from "@/server/plans/actions";

/** The plan page's heading; renaming saves at once (the details card has no name field). */
export function PlanTitle({
  planId,
  name,
  isTemplate,
}: {
  planId: string;
  /** What the server holds; a different value (a restored version) replaces the shown one. */
  name: string;
  isTemplate: boolean;
}) {
  const t = useTranslations("Plans.board");
  const tErrors = useTranslations("Plans.board.errors");
  const id = useId();
  const [shown, setShown] = useState(name);
  const [server, setServer] = useState(name);
  if (name !== server) {
    setServer(name);
    setShown(name);
  }

  async function rename(next: string) {
    try {
      const result = await renamePlanAction({ id: planId, name: next });
      if (!result.ok) return tErrors(result.error);
    } catch {
      return tErrors("generic");
    }
    // Shown before the refreshed page arrives with it.
    setShown(next);
    return null;
  }

  return (
    <div className="grid min-w-0 gap-1">
      <EditableTitle
        value={shown}
        label={t("name")}
        editLabel={t("rename")}
        validate={(value) =>
          value === ""
            ? tErrors("nameRequired")
            : value.length > PLAN_NAME_MAX
              ? tErrors("nameTooLong", { max: PLAN_NAME_MAX })
              : null
        }
        onConfirm={rename}
        describedBy={isTemplate ? undefined : `${id}-hint`}
      />
      {isTemplate ? null : (
        <p id={`${id}-hint`} className="text-muted-foreground px-2 text-sm">
          {t("details.nameHint")}
        </p>
      )}
    </div>
  );
}
