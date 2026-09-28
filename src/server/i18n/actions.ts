"use server";

import { isLocale } from "@/i18n/config";

import { setLocaleCookie } from "./locale-cookie";

/**
 * Remembers a signed-out visitor's language choice. Public: it only writes the caller's own
 * NEXT_LOCALE cookie with a supported value, and Next.js re-renders the page after it.
 */
export async function setLocaleAction(locale: unknown): Promise<{ ok: boolean }> {
  if (!isLocale(locale)) return { ok: false };
  await setLocaleCookie(locale);
  return { ok: true };
}
