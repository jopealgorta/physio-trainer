import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import { isUniqueViolation } from "@/db/errors";
import type { Tx } from "@/db/rls";
import { customers, physios, routines, shareLinks, weeklyPlans, type ShareLink } from "@/db/schema";
import { endOfDay, todayIn } from "@/lib/calendar-date";
import { generatePin } from "@/lib/pin";
import { generateCode, shareSlug } from "@/lib/share-links";

import { hashPin } from "./pin-hash";
import {
  isUuid,
  type Result,
  type ShareError,
  type ShareRef,
  type UpdateLinkInput,
} from "./schemas";

const ok = <T>(data: T) => ({ ok: true, data }) as const;
const fail = <E extends string>(error: E) => ({ ok: false, error }) as const;

const MAX_CODE_ATTEMPTS = 5;

/** Who and what a link belongs to, read under the physio's session. */
export type ShareContext = {
  physioId: string;
  handle: string;
  timeZone: string;
  customer: {
    id: string;
    firstName: string;
    phone: string | null;
    email: string | null;
    locale: string;
    archived: boolean;
  };
  /** Name the default slug comes from. */
  itemName: string;
  itemStatus: "draft" | "active" | "archived" | null;
};

const customerColumns = {
  id: customers.id,
  firstName: customers.firstName,
  phone: customers.phone,
  email: customers.email,
  locale: customers.locale,
  archivedAt: customers.archivedAt,
};

/**
 * Resolves the target of a link to its customer (and the routine or plan name). Null when it is
 * not the physio's, or has no customer (templates are never shared).
 */
export async function getShareContext(
  tx: Tx,
  physioId: string,
  ref: ShareRef,
): Promise<ShareContext | null> {
  const ids = [
    ref.target === "customer" ? ref.customerId : null,
    ref.target === "routine" ? ref.routineId : null,
    ref.target === "weekly_plan" ? ref.weeklyPlanId : null,
  ].filter((id): id is string => id !== null);
  if (!ids.every(isUuid)) return null;

  const [physio] = await tx
    .select({ handle: physios.handle, timeZone: physios.timezone })
    .from(physios)
    .where(eq(physios.id, physioId));
  if (!physio) return null;

  let row:
    | {
        customer: ShareContext["customer"] & { archivedAt: Date | null };
        name: string;
        status: ShareContext["itemStatus"];
      }
    | undefined;
  if (ref.target === "customer") {
    const [found] = await tx
      .select(customerColumns)
      .from(customers)
      .where(and(eq(customers.physioId, physioId), eq(customers.id, ref.customerId)));
    row = found && { customer: { ...found, archived: false }, name: found.firstName, status: null };
  } else if (ref.target === "routine") {
    const [found] = await tx
      .select({ ...customerColumns, name: routines.name, status: routines.status })
      .from(routines)
      .innerJoin(
        customers,
        and(eq(customers.physioId, routines.physioId), eq(customers.id, routines.customerId)),
      )
      .where(and(eq(routines.physioId, physioId), eq(routines.id, ref.routineId)));
    row = found && {
      customer: { ...found, archived: false },
      name: found.name,
      status: found.status,
    };
  } else {
    const [found] = await tx
      .select({ ...customerColumns, name: weeklyPlans.name, status: weeklyPlans.status })
      .from(weeklyPlans)
      .innerJoin(
        customers,
        and(eq(customers.physioId, weeklyPlans.physioId), eq(customers.id, weeklyPlans.customerId)),
      )
      .where(and(eq(weeklyPlans.physioId, physioId), eq(weeklyPlans.id, ref.weeklyPlanId)));
    row = found && {
      customer: { ...found, archived: false },
      name: found.name,
      status: found.status,
    };
  }
  if (!row) return null;

  const { archivedAt, ...customer } = row.customer;
  return {
    physioId,
    handle: physio.handle,
    timeZone: physio.timeZone,
    customer: { ...customer, archived: archivedAt !== null },
    itemName: row.name,
    itemStatus: row.status,
  };
}

const refWhere = (physioId: string, ref: ShareRef) =>
  and(
    eq(shareLinks.physioId, physioId),
    ref.target === "customer"
      ? and(eq(shareLinks.target, "customer"), eq(shareLinks.customerId, ref.customerId))
      : ref.target === "routine"
        ? eq(shareLinks.routineId, ref.routineId)
        : eq(shareLinks.weeklyPlanId, ref.weeklyPlanId),
  );

/** The live link of a target, or the most recent revoked one, or null if it never had one. */
export async function getLatestLink(
  tx: Tx,
  physioId: string,
  ref: ShareRef,
): Promise<ShareLink | null> {
  const rows = await tx
    .select()
    .from(shareLinks)
    .where(refWhere(physioId, ref))
    .orderBy(
      // Live first (revoked_at is null), then the newest.
      desc(isNull(shareLinks.revokedAt)),
      desc(shareLinks.createdAt),
      desc(shareLinks.id),
    )
    .limit(1);
  return rows[0] ?? null;
}

type LinkDefaults = Pick<ShareLink, "slug" | "pinHash" | "expiresAt">;

/**
 * Inserts a link, retrying on a (1 in 2^40) code collision. A concurrent creation of the live
 * link for the same target wins: its row is returned instead.
 */
async function insertLink(
  tx: Tx,
  physioId: string,
  ref: ShareRef,
  context: ShareContext,
  defaults: LinkDefaults,
): Promise<ShareLink> {
  const customerId = context.customer.id;
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    try {
      const [row] = await tx.transaction(async (savepoint) =>
        savepoint
          .insert(shareLinks)
          .values({
            physioId,
            customerId,
            target: ref.target,
            routineId: ref.target === "routine" ? ref.routineId : null,
            weeklyPlanId: ref.target === "weekly_plan" ? ref.weeklyPlanId : null,
            code: generateCode(),
            ...defaults,
          })
          .returning(),
      );
      return row!;
    } catch (error) {
      if (isUniqueViolation(error, "share_links_code_unique")) continue;
      if (isUniqueViolation(error)) {
        const live = await getLatestLink(tx, physioId, ref);
        if (live && live.revokedAt === null) return live;
      }
      throw error;
    }
  }
  throw new Error("Could not generate a unique share code");
}

const defaultsFor = (context: ShareContext): LinkDefaults => ({
  slug: shareSlug(context.itemName),
  pinHash: null,
  expiresAt: null,
});

/**
 * The target's live link. Created on first use (PIN off, no expiry); when it only ever had
 * revoked links this returns the latest of them so the physio sees it was revoked, rather than
 * silently undoing the revoke.
 */
export async function ensureShareLink(
  tx: Tx,
  physioId: string,
  ref: ShareRef,
): Promise<Result<{ link: ShareLink; context: ShareContext }, ShareError>> {
  const context = await getShareContext(tx, physioId, ref);
  if (!context) return fail("notFound");
  const existing = await getLatestLink(tx, physioId, ref);
  if (existing) return ok({ link: existing, context });
  if (context.customer.archived) return fail("customerArchived");
  const link = await insertLink(tx, physioId, ref, context, defaultsFor(context));
  return ok({ link, context });
}

/**
 * Revokes the live link (if any) and creates a new one with a new code. The slug, PIN and expiry
 * carry over: regenerating is about the code, so a patient who knows the PIN keeps using it.
 */
export async function renewShareLink(
  tx: Tx,
  physioId: string,
  ref: ShareRef,
): Promise<Result<{ link: ShareLink; context: ShareContext }, ShareError>> {
  const context = await getShareContext(tx, physioId, ref);
  if (!context) return fail("notFound");
  if (context.customer.archived) return fail("customerArchived");

  const previous = await getLatestLink(tx, physioId, ref);
  if (previous && previous.revokedAt === null) {
    await tx
      .update(shareLinks)
      .set({ revokedAt: new Date() })
      .where(and(eq(shareLinks.physioId, physioId), eq(shareLinks.id, previous.id)));
  }
  const defaults = previous
    ? { slug: previous.slug, pinHash: previous.pinHash, expiresAt: previous.expiresAt }
    : defaultsFor(context);
  const link = await insertLink(tx, physioId, ref, context, defaults);
  return ok({ link, context });
}

async function liveLinkWithContext(tx: Tx, physioId: string, id: string) {
  if (!isUuid(id)) return null;
  const [link] = await tx
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.physioId, physioId), eq(shareLinks.id, id)));
  if (!link) return null;
  const ref: ShareRef =
    link.target === "customer"
      ? { target: "customer", customerId: link.customerId }
      : link.target === "routine"
        ? { target: "routine", routineId: link.routineId! }
        : { target: "weekly_plan", weeklyPlanId: link.weeklyPlanId! };
  const context = await getShareContext(tx, physioId, ref);
  return context ? { link, ref, context } : null;
}

type Edited = { link: ShareLink; ref: ShareRef; context: ShareContext };

/** Edits a live link's slug and expiry. A revoked link is final: it reads as not found. */
export async function updateShareLink(
  tx: Tx,
  physioId: string,
  input: UpdateLinkInput,
  now: Date = new Date(),
): Promise<Result<Edited, ShareError>> {
  const found = await liveLinkWithContext(tx, physioId, input.id);
  if (!found || found.link.revokedAt !== null) return fail("notFound");
  if (found.context.customer.archived) return fail("customerArchived");

  const patch: Partial<Pick<ShareLink, "slug" | "expiresAt">> = {};
  if (input.slug !== undefined) patch.slug = input.slug;
  if (input.expiresOn !== undefined) {
    if (input.expiresOn !== null && input.expiresOn < todayIn(found.context.timeZone, now)) {
      return fail("expiryInPast");
    }
    patch.expiresAt =
      input.expiresOn === null ? null : endOfDay(found.context.timeZone, input.expiresOn);
  }
  if (Object.keys(patch).length === 0) return ok(found);

  const [link] = await tx
    .update(shareLinks)
    .set(patch)
    .where(and(eq(shareLinks.physioId, physioId), eq(shareLinks.id, input.id)))
    .returning();
  return ok({ ...found, link: link! });
}

/**
 * Turns the PIN on (a new random one each time: the previous PIN stops working) or off. Only the
 * hash is stored; the PIN is returned this once for the physio to pass on.
 */
export async function setSharePin(
  tx: Tx,
  physioId: string,
  id: string,
  enabled: boolean,
): Promise<Result<Edited & { pin: string | null }, ShareError>> {
  const found = await liveLinkWithContext(tx, physioId, id);
  if (!found || found.link.revokedAt !== null) return fail("notFound");
  if (found.context.customer.archived) return fail("customerArchived");

  const pin = enabled ? generatePin() : null;
  const [link] = await tx
    .update(shareLinks)
    .set({ pinHash: pin === null ? null : await hashPin(pin) })
    .where(and(eq(shareLinks.physioId, physioId), eq(shareLinks.id, id)))
    .returning();
  return ok({ ...found, link: link!, pin });
}

/** Revokes one link. Revoking a revoked link is a no-op that still succeeds. */
export async function revokeShareLink(
  tx: Tx,
  physioId: string,
  id: string,
): Promise<Result<Edited, ShareError>> {
  const found = await liveLinkWithContext(tx, physioId, id);
  if (!found) return fail("notFound");
  if (found.link.revokedAt !== null) return ok(found);
  const [link] = await tx
    .update(shareLinks)
    .set({ revokedAt: new Date() })
    .where(and(eq(shareLinks.physioId, physioId), eq(shareLinks.id, id)))
    .returning();
  return ok({ ...found, link: link! });
}

/** Archiving a customer revokes everything they were sent (spec 04 hook). */
export async function revokeCustomerLinks(
  tx: Tx,
  physioId: string,
  customerId: string,
): Promise<void> {
  await tx
    .update(shareLinks)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(shareLinks.physioId, physioId),
        eq(shareLinks.customerId, customerId),
        isNull(shareLinks.revokedAt),
      ),
    );
}
