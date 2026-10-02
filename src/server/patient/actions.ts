"use server";

import type { Route } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { env } from "@/env";
import { isValidPin, normalizePin } from "@/lib/pin";
import { buildSharePath } from "@/lib/share-links";
import { verifyPin } from "@/server/sharing/pin-hash";

import { pinCookieMaxAge, pinCookieName, pinToken } from "./pin-cookie";
import { resolveLink } from "./resolve-link";

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

  const resolved = await resolveLink(code);
  if (resolved.status !== "ok") return { ok: false, error: "unavailable" };
  const { shell, link } = resolved;
  const { owner, unlocked } = await getLinkAccess(shell, link);
  if (!unlocked) return { ok: false, error: "unavailable" };
  if (owner) return { ok: false, error: "preview" };

  return logSession(shell, link, parsed.data);
}
