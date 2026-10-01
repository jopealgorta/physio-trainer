import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { customers, physios, shareLinks } from "@/db/schema";
import { env } from "@/env";
import { resolveLocale, type Locale } from "@/i18n/config";
import { buildBranding, type Branding } from "@/lib/branding";
import { isShareCode, type ShareTarget } from "@/lib/share-links";
import { brandingSource } from "@/server/branding/queries";

import { isPinTokenValid } from "./pin-cookie";

/**
 * Everything the patient surfaces need to render around a link, whether or not it is usable
 * (the "unavailable" page still shows the physio's branding and contact).
 */
export type LinkShell = {
  physioId: string;
  handle: string;
  /** The physio's time zone: "today" for the patient is the physio's day (spec 08). */
  timeZone: string;
  code: string;
  slug: string;
  /** The customer's language, not the physio's. */
  locale: Locale;
  branding: Branding & { updatedAt: Date };
};

/** A usable link: every id the patient queries use comes from here, never from the request. */
export type ActiveLink = {
  id: string;
  target: ShareTarget;
  customerId: string;
  routineId: string | null;
  weeklyPlanId: string | null;
  customerFirstName: string;
  expiresAt: Date | null;
  /** Server-side only: never sent to the client. */
  pinHash: string | null;
};

export type UnavailableReason = "revoked" | "expired" | "customer_archived";

export type ResolvedLink =
  | { status: "not_found" }
  | { status: "unavailable"; reason: UnavailableReason; shell: LinkShell }
  | { status: "ok"; shell: LinkShell; link: ActiveLink };

/** First step of every patient request: find the link by code and decide if it can be used. */
export async function resolveLink(code: string, now: Date = new Date()): Promise<ResolvedLink> {
  if (!isShareCode(code)) return { status: "not_found" };

  const [row] = await db
    .select({
      id: shareLinks.id,
      physioId: shareLinks.physioId,
      customerId: shareLinks.customerId,
      target: shareLinks.target,
      routineId: shareLinks.routineId,
      weeklyPlanId: shareLinks.weeklyPlanId,
      slug: shareLinks.slug,
      code: shareLinks.code,
      pinHash: shareLinks.pinHash,
      expiresAt: shareLinks.expiresAt,
      revokedAt: shareLinks.revokedAt,
      physio: physios,
      customerFirstName: customers.firstName,
      customerLocale: customers.locale,
      customerArchivedAt: customers.archivedAt,
    })
    .from(shareLinks)
    .innerJoin(physios, eq(physios.id, shareLinks.physioId))
    .innerJoin(customers, eq(customers.id, shareLinks.customerId))
    .where(eq(shareLinks.code, code));
  if (!row) return { status: "not_found" };

  // Branding comes from the physio row already joined: no second round trip per request.
  const branding = {
    ...buildBranding(brandingSource(row.physio)),
    updatedAt: row.physio.updatedAt,
  };

  const shell: LinkShell = {
    physioId: row.physioId,
    handle: row.physio.handle,
    timeZone: row.physio.timezone,
    code: row.code,
    slug: row.slug,
    locale: resolveLocale(row.customerLocale),
    branding,
  };

  if (row.revokedAt !== null) return { status: "unavailable", reason: "revoked", shell };
  if (row.customerArchivedAt !== null) {
    return { status: "unavailable", reason: "customer_archived", shell };
  }
  if (row.expiresAt !== null && row.expiresAt <= now) {
    return { status: "unavailable", reason: "expired", shell };
  }

  return {
    status: "ok",
    shell,
    link: {
      id: row.id,
      target: row.target,
      customerId: row.customerId,
      routineId: row.routineId,
      weeklyPlanId: row.weeklyPlanId,
      customerFirstName: row.customerFirstName,
      expiresAt: row.expiresAt,
      pinHash: row.pinHash,
    },
  };
}

/**
 * Whether this request may see the link's content: no PIN set, the signed-in owner previewing
 * their own link, or a browser holding a token for the current PIN.
 */
export function hasLinkAccess(
  shell: Pick<LinkShell, "code" | "physioId">,
  link: Pick<ActiveLink, "pinHash">,
  request: { pinToken: string | undefined; sessionPhysioId: string | null },
): boolean {
  if (link.pinHash === null) return true;
  if (request.sessionPhysioId === shell.physioId) return true;
  return isPinTokenValid(env.SUPABASE_SECRET_KEY, shell.code, link.pinHash, request.pinToken);
}
