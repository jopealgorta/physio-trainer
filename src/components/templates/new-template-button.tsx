"use client";

import { useTranslations } from "next-intl";

import { CreateButton } from "@/components/create-button";
import type { TemplateKind } from "@/lib/templates";
import { createTemplateAction, type TemplateFormState } from "@/server/templates/actions";

const initialState: TemplateFormState = { status: "idle" };

const FORM_ERRORS = ["notFound", "invalid"] as const;

/** "New routine/plan template": created with a default name and opened in the editor. */
export function NewTemplateButton({ kind }: { kind: TemplateKind }) {
  const t = useTranslations("Templates.new");
  const tErrors = useTranslations("Templates.errors");
  return (
    <CreateButton
      action={createTemplateAction}
      initialState={initialState}
      fields={{ kind, name: t(`defaultName.${kind}`) }}
      label={t(`button.${kind}`)}
      pendingLabel={t("creating")}
      errorMessage={(state) =>
        state.status === "error"
          ? tErrors(FORM_ERRORS.find((code) => code === state.formError) ?? "invalid")
          : null
      }
    />
  );
}
