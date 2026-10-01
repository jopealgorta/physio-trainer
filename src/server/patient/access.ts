import "server-only";

import { cookies } from "next/headers";

import { getSessionPhysio } from "@/server/auth/session";

import { pinCookieName } from "./pin-cookie";
import { hasLinkAccess, type ActiveLink, type LinkShell } from "./resolve-link";

/**
 * Who is asking, for every patient page: the signed-in owner previewing their own link, and
 * whether this browser may see the content (no PIN, the owner, or a token for the current PIN).
 */
export async function getLinkAccess(
  shell: Pick<LinkShell, "code" | "physioId">,
  link: Pick<ActiveLink, "pinHash">,
): Promise<{ owner: boolean; unlocked: boolean }> {
  const [session, cookieStore] = await Promise.all([getSessionPhysio(), cookies()]);
  return {
    owner: session?.physioId === shell.physioId,
    unlocked: hasLinkAccess(shell, link, {
      pinToken: cookieStore.get(pinCookieName(shell.code))?.value,
      sessionPhysioId: session?.physioId ?? null,
    }),
  };
}
