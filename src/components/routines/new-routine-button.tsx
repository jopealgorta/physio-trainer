"use client";

import { useTranslations } from "next-intl";

import { CreateButton } from "@/components/create-button";
import { createRoutineAction, type CreateRoutineFormState } from "@/server/routines/actions";

const initialState: CreateRoutineFormState = { status: "idle" };

const FORM_ERRORS = ["customerNotFound", "invalid"] as const;

/** "New routine" for a customer: a draft with a default name and no case, opened in the editor. */
export function NewRoutineButton({ customerId }: { customerId: string }) {
  const t = useTranslations("Routines.new");
  return (
    <CreateButton
      action={createRoutineAction}
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
