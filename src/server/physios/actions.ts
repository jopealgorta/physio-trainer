"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { Tx } from "@/db/rls";
import { handleProblem } from "@/lib/handles";
import { safeNextPath } from "@/lib/redirects";
import { withPhysio } from "@/server/auth/session";
import { setLocaleCookie } from "@/server/i18n/locale-cookie";

import { completeOnboarding, updateProfile, type ProfileResult } from "./mutations";
import { isHandleAvailable } from "./queries";
import {
  profileFieldErrors,
  profileSchema,
  type ProfileFormState,
  type ProfileInput,
} from "./schemas";

type ProfileMutation = (tx: Tx, physioId: string, input: ProfileInput) => Promise<ProfileResult>;

export async function completeOnboardingAction(
  _state: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const result = await saveProfile(formData, completeOnboarding);
  if (result.status !== "saved") return result;
  redirect(safeNextPath(formData.get("next")?.toString()) as Route);
}

export async function updateProfileAction(
  _state: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const result = await saveProfile(formData, updateProfile);
  if (result.status === "saved") revalidatePath("/", "layout");
  return result;
}

/** Live availability check for the handle field; invalid handles are never available. */
export async function checkHandleAction(handle: string): Promise<boolean> {
  // A public endpoint: the argument is only typed as a string, so coerce it.
  const normalized = String(handle ?? "")
    .trim()
    .toLowerCase();
  if (handleProblem(normalized)) return false;
  return withPhysio((tx) => isHandleAvailable(tx, normalized));
}

async function saveProfile(
  formData: FormData,
  mutation: ProfileMutation,
): Promise<ProfileFormState> {
  const submittedHandle = String(formData.get("handle") ?? "")
    .trim()
    .toLowerCase();
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", fieldErrors: profileFieldErrors(parsed.error), submittedHandle };
  }

  const result = await withPhysio((tx, physioId) => mutation(tx, physioId, parsed.data));
  if (!result.ok) {
    return result.error === "handleTaken"
      ? { status: "error", fieldErrors: { handle: "taken" }, submittedHandle }
      : { status: "error", fieldErrors: {}, submittedHandle, formError: "unknown" };
  }

  await setLocaleCookie(result.data.locale);
  return { status: "saved" };
}
