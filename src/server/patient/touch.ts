import "server-only";

import { and, eq, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { shareLinks } from "@/db/schema";

/** A link's open counter moves at most this often, however many times the page is opened. */
export const TOUCH_INTERVAL_MINUTES = 30;

/**
 * Counts an open of the page (spec 10 rule 6): one write per link per 30 minutes, done as a
 * single conditional UPDATE so concurrent opens cannot both count. Returns whether it counted.
 */
export async function touchLink(linkId: string, now: Date = new Date()): Promise<boolean> {
  const cutoff = new Date(now.getTime() - TOUCH_INTERVAL_MINUTES * 60_000);
  const rows = await db
    .update(shareLinks)
    .set({ lastOpenedAt: now, openCount: sql`${shareLinks.openCount} + 1` })
    .where(
      and(
        eq(shareLinks.id, linkId),
        or(isNull(shareLinks.lastOpenedAt), lt(shareLinks.lastOpenedAt, cutoff)),
      ),
    )
    .returning({ id: shareLinks.id });
  return rows.length > 0;
}
