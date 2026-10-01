"use server";

import { revalidatePath } from "next/cache";

import { withPhysio } from "@/server/auth/session";

import { copyIntoNextPhase, setPhase } from "./mutations";
import {
  copyPhaseSchema,
  setPhaseSchema,
  windowIssue,
  type PhaseActionError,
  type PhaseKind,
  type Result,
} from "./schemas";

/** A window problem names its field's error; any other bad input is a plain "invalid". */
function invalid(error: Parameters<typeof windowIssue>[0]): { ok: false; error: PhaseActionError } {
  const issue = error.issues.find((i) => i.message === "labelTooLong");
  return { ok: false, error: windowIssue(error) ?? (issue ? "labelTooLong" : "invalid") };
}

function revalidate(kind: PhaseKind, id: string) {
  revalidatePath(kind === "routine" ? `/routines/${id}` : `/plans/${id}`);
  revalidatePath(kind === "routine" ? "/routines" : "/plans", "layout");
  revalidatePath("/customers", "layout");
}

export async function setPhaseAction(input: unknown): Promise<Result<object, PhaseActionError>> {
  const parsed = setPhaseSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const result = await withPhysio((tx, physioId) => setPhase(tx, physioId, parsed.data));
  if (result.ok) revalidate(parsed.data.kind, parsed.data.id);
  return result;
}

export async function copyIntoNextPhaseAction(
  input: unknown,
): Promise<Result<{ id: string }, PhaseActionError>> {
  const parsed = copyPhaseSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const result = await withPhysio((tx, physioId) => copyIntoNextPhase(tx, physioId, parsed.data));
  if (result.ok) {
    // The predecessor's end date may have changed too.
    revalidate(parsed.data.kind, parsed.data.id);
    revalidate(parsed.data.kind, result.data.id);
  }
  return result;
}
