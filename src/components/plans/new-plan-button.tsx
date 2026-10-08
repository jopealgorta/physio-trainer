"use client";

import { useTranslations } from "next-intl";

import { CreateButton } from "@/components/create-button";
import { createPlanAction, type CreatePlanFormState } from "@/server/plans/actions";

const initialState: CreatePlanFormState = { status: "idle" };

const FORM_ERRORS = ["customerNotFound", "invalid"] as const;

/** "New plan" for a customer: a draft weekly plan with a default name and no case, opened in the editor. */
export function NewPlanButton({ customerId }: { customerId: string }) {
  const t = useTranslations("Plans.new");
  return (
    <CreateButton
      action={createPlanAction}
      initialState={initialState}
      fields={{ customerId, name: t("defaultName") }}
      label={t("button")}
      pendingLabel={t("creating")}
      errorMessage={(state) =>
        state.status === "error"
          ? t(`errors.${FORM_ERRORS.find((code) => code === state.formError) ?? "invalid"}`)
          : null
      }
    />
  );
}
