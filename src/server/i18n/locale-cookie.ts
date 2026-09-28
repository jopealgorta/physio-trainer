import "server-only";

import { cookies } from "next/headers";

import { localeCookieName } from "@/i18n/config";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Remembers the physio's UI language (read by src/i18n/request.ts). Actions and route handlers only. */
export async function setLocaleCookie(locale: string): Promise<void> {
  (await cookies()).set(localeCookieName, locale, {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
  });
}
