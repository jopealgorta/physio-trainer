"use server";

import type { Route } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { env } from "@/env";
import { isValidPin, normalizePin } from "@/lib/pin";
import { buildSharePath } from "@/lib/share-links";
import { verifyPin } from "@/server/sharing/pin-hash";

import { getLinkAccess } from "./access";
import { logExerciseSchema } from "./exercise-log-schema";
import { logExercise, type PatientExerciseLog } from "./log-exercise";
import { logSessionSchema } from "./log-schema";
import { logSession, type PatientLog } from "./log-session";
import { pinCookieMaxAge, pinCookieName, pinToken } from "./pin-cookie";
import {
  resolveLink,
  type ActiveLink as ResolvedLink,
  type LinkShell as ResolvedShell,
} from "./resolve-link";

export type PinFormState = { status: "idle" } | { status: "wrong" } | { status: "invalid" };

/**
 * Checks the PIN a patient typed and, if right, remembers it in a cookie and reloads the link.
 * The link is looked up again here by its code: the form only carries the code, never an id.
 * There is no attempt limit (spec 10): the PIN is a light lock.
 */
export async function verifyPinAction(
  code: string,
  _state: PinFormState,
  formData: FormData,
): Promise<PinFormState> {
  const resolved = await resolveLink(code);
  if (resolved.status === "not_found") notFound();
  const linkPath = buildSharePath(resolved.shell.handle, resolved.shell.slug, code) as Route;
  const pinHash = resolved.status === "ok" ? resolved.link.pinHash : null;
  // Revoked meanwhile, or no longer protected: the page itself decides what to show.
  if (resolved.status !== "ok" || pinHash === null) redirect(linkPath);

  const pin = normalizePin(formData.get("pin"));
  if (!isValidPin(pin)) return { status: "invalid" };
  if (!(await verifyPin(pin, pinHash))) return { status: "wrong" };

  (await cookies()).set(pinCookieName(code), pinToken(env.SUPABASE_SECRET_KEY, code, pinHash), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: pinCookieMaxAge(resolved.link.expiresAt),
  });
  redirect(linkPath);
}

/** The write gate shared by the log actions: link resolved, PIN unlocked, and not the owner previewing. */
async function resolveWritableLink(
  code: string,
): Promise<{ error: "unavailable" | "preview" } | { shell: ResolvedShell; link: ResolvedLink }> {
  const resolved = await resolveLink(code);
  if (resolved.status !== "ok") return { error: "unavailable" };
  const { shell, link } = resolved;
  const { owner, unlocked } = await getLinkAccess(shell, link);
  if (!unlocked) return { error: "unavailable" };
  if (owner) return { error: "preview" };
  return { shell, link };
}

export type LogActionResult =
  | { ok: true; data: PatientLog }
  | { ok: false; error: "invalid" | "unavailable" | "date" | "unreachable" | "preview" };

/**
 * Saves a patient's log (spec 13). Only the link's `code` identifies who is asking: the link is
 * resolved and its PIN gate applied exactly as for the page, and the rest of the input is
 * validated and matched against what that link can reach inside `logSession`. The signed-in
 * physio previewing their own link never writes a log.
 */
export async function logSessionAction(code: string, raw: unknown): Promise<LogActionResult> {
  const parsed = logSessionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const gate = await resolveWritableLink(code);
  if ("error" in gate) return { ok: false, error: gate.error };
  const { shell, link } = gate;

  return logSession(shell, link, parsed.data);
}

export type ExerciseLogActionResult =
  | { ok: true; data: PatientExerciseLog | null }
  | { ok: false; error: "invalid" | "unavailable" | "date" | "unreachable" | "preview" };

/** Saves, edits or clears (all fields null) a patient's log of one exercise; same gate as `logSessionAction`. */
export async function logExerciseAction(
  code: string,
  raw: unknown,
): Promise<ExerciseLogActionResult> {
  const parsed = logExerciseSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const gate = await resolveWritableLink(code);
  if ("error" in gate) return { ok: false, error: gate.error };
  const { shell, link } = gate;

  return logExercise(shell, link, parsed.data);
}
