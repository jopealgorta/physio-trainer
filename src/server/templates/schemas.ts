import { z } from "zod";

import { ASSIGN_STATUSES, NAME_MAX } from "@/lib/templates";
import { idSchema, isUuid, type Result } from "@/server/routines/schemas";

export { idSchema, isUuid, type Result };

const kind = z.enum(["routine", "plan"]);
export const templateKindSchema = kind;
export { NAME_MAX };

const blankToNull = (value: unknown) => {
  const text = typeof value === "string" ? value.trim() : value;
  return text === "" || text == null ? null : text;
};

const name = z.preprocess((value) => value ?? "", z.string().trim().min(1, "nameRequired"));
const caseId = z.preprocess(blankToNull, z.union([z.null(), z.uuid()], { error: "invalid" }));

/** The name limit depends on the kind (routine and plan names share 80 today, but not by contract). */
const kindAwareName = (value: { kind: "routine" | "plan"; name: string }, ctx: z.RefinementCtx) => {
  if (value.name.length > NAME_MAX[value.kind]) {
    ctx.addIssue({ code: "custom", path: ["name"], message: "nameTooLong" });
  }
};

export const createTemplateSchema = z.object({ kind, name }).superRefine(kindAwareName);
export type CreateTemplateInput = z.output<typeof createTemplateSchema>;

export const saveAsTemplateSchema = z
  .object({ kind, sourceId: z.uuid(), name })
  .superRefine(kindAwareName);
export type SaveAsTemplateInput = z.output<typeof saveAsTemplateSchema>;

export const assignTemplateSchema = z
  .object({
    kind,
    templateId: z.uuid(),
    customerId: z.uuid(),
    caseId,
    name,
    status: z.enum(ASSIGN_STATUSES),
  })
  .superRefine(kindAwareName);
export type AssignTemplateInput = z.output<typeof assignTemplateSchema>;

export const duplicateTemplateSchema = z
  .object({ kind, templateId: z.uuid(), name })
  .superRefine(kindAwareName);
export type DuplicateTemplateInput = z.output<typeof duplicateTemplateSchema>;

/** What the duplicate action receives: the server builds the name from the source's. */
export const duplicateRequestSchema = z.object({ kind, templateId: z.uuid() });

export type TemplateError =
  | "notFound"
  | "alreadyTemplate"
  | "templateNotFound"
  | "templateArchived"
  | "customerNotFound"
  | "customerArchived"
  | "caseNotFound"
  | "needsItems"
  | "needsEntries";
