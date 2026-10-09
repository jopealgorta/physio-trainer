"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { withPhysio } from "@/server/auth/session";
import { physioToday } from "@/server/schedule/active";

import {
  closeCase,
  createCase,
  createCustomer,
  reopenCase,
  setCustomerArchived,
  updateCase,
  updateCustomer,
} from "./mutations";
import {
  caseFieldErrors,
  caseSchema,
  closeCaseSchema,
  customerFieldErrors,
  customerSchema,
  formValues,
  idSchema,
  type CaseFormState,
  type CustomerFormState,
  type Result,
} from "./schemas";

const revalidateCustomers = () => revalidatePath("/customers", "layout");

/** `null` when the field is absent or blank, otherwise the parse result. */
function optionalId(formData: FormData, name: string) {
  const raw = formData.get(name);
  return raw === null || raw === "" ? null : idSchema.safeParse(raw);
}

export async function saveCustomerAction(
  _state: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const id = optionalId(formData, "id");
  if (id && !id.success) return { status: "error", fieldErrors: {}, formError: "notFound" };

  const parsed = customerSchema.safeParse(formValues(formData));
  if (!parsed.success) return { status: "error", fieldErrors: customerFieldErrors(parsed.error) };

  const result = await withPhysio(
    async (tx, physioId): Promise<Result<{ id: string }, "notFound">> => {
      if (id) {
        const updated = await updateCustomer(tx, physioId, id.data, parsed.data);
        return updated.ok ? { ok: true, data: { id: id.data } } : updated;
      }
      return createCustomer(tx, physioId, parsed.data);
    },
  );
  if (!result.ok) return { status: "error", fieldErrors: {}, formError: "notFound" };
  revalidateCustomers();
  redirect(`/customers/${result.data.id}`);
}

export async function setCustomerArchivedAction(
  id: string,
  archived: boolean,
): Promise<Result<null, "notFound">> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "notFound" };
  const result = await withPhysio((tx, physioId) =>
    setCustomerArchived(tx, physioId, parsed.data, archived === true),
  );
  if (result.ok) revalidateCustomers();
  return result;
}

export async function saveCaseAction(
  _state: CaseFormState,
  formData: FormData,
): Promise<CaseFormState> {
  const id = optionalId(formData, "id");
  if (id && !id.success) return { status: "error", fieldErrors: {}, formError: "notFound" };
  const customerId = id ? null : idSchema.safeParse(formData.get("customerId"));
  if (customerId && !customerId.success) {
    return { status: "error", fieldErrors: {}, formError: "customerNotFound" };
  }

  const parsed = caseSchema.safeParse(formValues(formData));
  if (!parsed.success) return { status: "error", fieldErrors: caseFieldErrors(parsed.error) };

  const result = await withPhysio(async (tx, physioId) => {
    if (id) return updateCase(tx, physioId, id.data, parsed.data);
    const today = await physioToday(tx, physioId);
    return createCase(tx, physioId, customerId!.data, parsed.data, today);
  });
  if (!result.ok) {
    return result.error === "openedAfterClosed"
      ? { status: "error", fieldErrors: { openedOn: "openedAfterClosed" } }
      : { status: "error", fieldErrors: {}, formError: result.error };
  }
  revalidateCustomers();
  return { status: "saved" };
}

export async function closeCaseAction(
  id: string,
  closedOn: string | null,
): Promise<Result<null, "notFound" | "notOpen" | "closedBeforeOpened" | "dateInvalid">> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: "notFound" };
  const parsed = closeCaseSchema.safeParse({ id, closedOn });
  if (!parsed.success) return { ok: false, error: "dateInvalid" };

  const result = await withPhysio(async (tx, physioId) =>
    closeCase(
      tx,
      physioId,
      parsed.data.id,
      parsed.data.closedOn ?? (await physioToday(tx, physioId)),
    ),
  );
  if (result.ok) revalidateCustomers();
  return result;
}

export async function reopenCaseAction(
  id: string,
): Promise<Result<null, "notFound" | "notClosed">> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "notFound" };
  const result = await withPhysio((tx, physioId) => reopenCase(tx, physioId, parsed.data));
  if (result.ok) revalidateCustomers();
  return result;
}
