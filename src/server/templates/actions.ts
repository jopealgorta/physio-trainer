"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { z } from "zod";

import { ROUTINE_SEARCH_MAX_LENGTH } from "@/lib/routines";
import { TEMPLATE_PICKER_LIMIT, withSuffix } from "@/lib/templates";
import { withPhysio } from "@/server/auth/session";

import { assignTemplate, createTemplate, duplicateTemplate, saveAsTemplate } from "./mutations";
import { getTemplateName, listCustomerCases, listTemplates, type TemplateOption } from "./queries";
import {
  NAME_MAX,
  assignTemplateSchema,
  createTemplateSchema,
  duplicateRequestSchema,
  idSchema,
  isUuid,
  saveAsTemplateSchema,
  templateKindSchema,
  type Result,
  type TemplateError,
} from "./schemas";

export type TemplateFormState =
  | { status: "idle" }
  | {
      status: "error";
      fieldErrors: { name?: string };
      formError?: TemplateError | "invalid";
    };

const PATHS = { routine: "/routines", plan: "/plans" } as const;

/** A template or a copy of one touches the routine and plan lists and the customers' tabs. */
function revalidateLists() {
  revalidatePath("/routines", "layout");
  revalidatePath("/plans", "layout");
  revalidatePath("/customers", "layout");
}

/** The name error when the name is what failed, otherwise a generic "invalid". */
function invalidForm(error: z.ZodError): TemplateFormState {
  const name = error.issues.find((issue) => issue.path[0] === "name");
  return name
    ? { status: "error", fieldErrors: { name: name.message } }
    : { status: "error", fieldErrors: {}, formError: "invalid" };
}

/** Fields: kind, name. Creates an empty template and opens it in its editor. */
export async function createTemplateAction(
  _state: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const parsed = createTemplateSchema.safeParse({
    kind: formData.get("kind"),
    name: formData.get("name"),
  });
  if (!parsed.success) return invalidForm(parsed.error);

  const result = await withPhysio((tx, physioId) => createTemplate(tx, physioId, parsed.data));
  if (!result.ok) return { status: "error", fieldErrors: {}, formError: result.error };
  revalidateLists();
  redirect(`${PATHS[parsed.data.kind]}/${result.data.id}`);
}

/** Fields: kind, sourceId, name. Copies a customer routine/plan into a template and opens it. */
export async function saveAsTemplateAction(
  _state: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const parsed = saveAsTemplateSchema.safeParse({
    kind: formData.get("kind"),
    sourceId: formData.get("sourceId"),
    name: formData.get("name"),
  });
  if (!parsed.success) return invalidForm(parsed.error);

  const result = await withPhysio((tx, physioId) => saveAsTemplate(tx, physioId, parsed.data));
  if (!result.ok) return { status: "error", fieldErrors: {}, formError: result.error };
  revalidateLists();
  redirect(`${PATHS[parsed.data.kind]}/${result.data.id}`);
}

/** Fields: kind, templateId, customerId, caseId, name, status. Copies a template to a customer. */
export async function assignTemplateAction(
  _state: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  // The dialog leaves the customer blank until one is chosen; neither id reaches a query unchecked.
  if (!idSchema.safeParse(formData.get("customerId")).success) {
    return { status: "error", fieldErrors: {}, formError: "customerNotFound" };
  }
  if (!idSchema.safeParse(formData.get("templateId")).success) {
    return { status: "error", fieldErrors: {}, formError: "templateNotFound" };
  }
  const parsed = assignTemplateSchema.safeParse({
    kind: formData.get("kind"),
    templateId: formData.get("templateId"),
    customerId: formData.get("customerId"),
    caseId: formData.get("caseId"),
    name: formData.get("name"),
    status: formData.get("status"),
  });
  if (!parsed.success) return invalidForm(parsed.error);

  const result = await withPhysio((tx, physioId) => assignTemplate(tx, physioId, parsed.data));
  if (!result.ok) return { status: "error", fieldErrors: {}, formError: result.error };
  revalidateLists();
  redirect(`${PATHS[parsed.data.kind]}/${result.data.id}`);
}

/**
 * Input `{ kind, templateId }`. The copy's name is the source's plus the locale's suffix, cut so
 * the whole fits the name limit; building it here keeps the caller from needing the source name.
 */
export async function duplicateTemplateAction(
  input: unknown,
): Promise<Result<{ id: string }, TemplateError | "invalid">> {
  const parsed = duplicateRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { kind, templateId } = parsed.data;
  const t = await getTranslations("Templates");

  const result = await withPhysio(async (tx, physioId) => {
    const sourceName = await getTemplateName(tx, physioId, kind, templateId);
    if (sourceName === null) return { ok: false, error: "templateNotFound" } as const;
    return duplicateTemplate(tx, physioId, {
      kind,
      templateId,
      name: withSuffix(sourceName, t("copySuffix"), NAME_MAX[kind]),
    });
  });
  if (result.ok) revalidateLists();
  return result;
}

/** Active templates matching a name, for the customer page's "From template…" picker. */
export async function searchTemplatesAction(input: {
  kind: "routine" | "plan";
  q?: string;
}): Promise<TemplateOption[]> {
  const kind = templateKindSchema.safeParse(input?.kind);
  if (!kind.success) return [];
  const q = (typeof input.q === "string" ? input.q : "").trim().slice(0, ROUTINE_SEARCH_MAX_LENGTH);
  return withPhysio((tx, physioId) =>
    listTemplates(tx, physioId, kind.data, q, TEMPLATE_PICKER_LIMIT),
  );
}

/** The cases of one of the physio's customers (open first); empty for a foreign or bad id. */
export async function listCasesAction(
  customerId: string,
): Promise<{ id: string; title: string }[]> {
  if (!isUuid(customerId)) return [];
  return withPhysio((tx, physioId) => listCustomerCases(tx, physioId, customerId));
}
