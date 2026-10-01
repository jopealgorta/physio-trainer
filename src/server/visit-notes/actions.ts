"use server";

import { revalidatePath } from "next/cache";

import { todayIn } from "@/lib/calendar-date";
import { withPhysio } from "@/server/auth/session";
import { getProfile } from "@/server/physios/queries";

import { createVisitNote, deleteVisitNote, updateVisitNote } from "./mutations";
import {
  formValues,
  idSchema,
  visitNoteFieldErrors,
  visitNoteSchema,
  type Result,
  type VisitNoteFormState,
} from "./schemas";

const revalidateCustomers = () => revalidatePath("/customers", "layout");

/** `null` when the field is absent or blank, otherwise the parse result. */
function optionalId(formData: FormData, name: string) {
  const raw = formData.get(name);
  return raw === null || raw === "" ? null : idSchema.safeParse(raw);
}

/** Creates a note for `customerId`, or updates the note `id` when it is present. */
export async function saveVisitNoteAction(
  _state: VisitNoteFormState,
  formData: FormData,
): Promise<VisitNoteFormState> {
  const id = optionalId(formData, "id");
  if (id && !id.success) return { status: "error", fieldErrors: {}, formError: "notFound" };
  const customerId = id ? null : idSchema.safeParse(formData.get("customerId"));
  if (customerId && !customerId.success) {
    return { status: "error", fieldErrors: {}, formError: "customerNotFound" };
  }

  const parsed = visitNoteSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return { status: "error", fieldErrors: visitNoteFieldErrors(parsed.error) };
  }

  const result = await withPhysio(async (tx, physioId) => {
    if (id) return updateVisitNote(tx, physioId, id.data, parsed.data);
    const profile = await getProfile(tx, physioId);
    const today = todayIn(profile?.timezone ?? "UTC");
    return createVisitNote(tx, physioId, customerId!.data, parsed.data, today);
  });
  if (!result.ok) return { status: "error", fieldErrors: {}, formError: result.error };
  revalidateCustomers();
  return { status: "saved" };
}

export async function deleteVisitNoteAction(id: string): Promise<Result<null, "notFound">> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "notFound" };
  const result = await withPhysio((tx, physioId) => deleteVisitNote(tx, physioId, parsed.data));
  if (result.ok) revalidateCustomers();
  return result;
}
