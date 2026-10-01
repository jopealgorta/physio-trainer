import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { authenticatedRole, authUid } from "drizzle-orm/supabase";

// Relative import: drizzle-kit loads the schema without the "@/" alias.
import { SLUG_MAX } from "../../lib/share-links";
import { timestamps } from "./_columns";
import { customers } from "./customers";
import { shareTargetEnum } from "./enums";
import { physios } from "./physios";
import { weeklyPlans } from "./plans";
import { routines } from "./routines";

/** Tenancy rule 1: a physio reads and writes only their own rows. */
const ownRows = (name: string, physioId: AnyPgColumn) =>
  pgPolicy(name, {
    for: "all",
    to: authenticatedRole,
    using: sql`${physioId} = ${authUid}`,
    withCheck: sql`${physioId} = ${authUid}`,
  });

/**
 * A no-account link to a customer's active content, one routine or one weekly plan (spec 10).
 * `code` is the only lookup key; the slug is cosmetic. Patients read it through the owner
 * connection after resolution (src/server/patient); physios manage it under RLS. The
 * `set_updated_at` trigger lives in the custom migration.
 */
export const shareLinks = pgTable(
  "share_links",
  {
    id: uuid().primaryKey().defaultRandom(),
    physioId: uuid()
      .notNull()
      .references(() => physios.id, { onDelete: "cascade" }),
    customerId: uuid().notNull(),
    target: shareTargetEnum().notNull(),
    routineId: uuid(),
    weeklyPlanId: uuid(),
    slug: text().notNull(),
    code: text().notNull(),
    /** scrypt hash of the 4-digit PIN; the PIN itself is shown once and never stored. */
    pinHash: text(),
    expiresAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    lastOpenedAt: timestamp({ withTimezone: true }),
    openCount: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    // A NULL routine_id / weekly_plan_id skips its FK (MATCH SIMPLE).
    foreignKey({
      name: "share_links_customer_fk",
      columns: [t.physioId, t.customerId],
      foreignColumns: [customers.physioId, customers.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "share_links_routine_fk",
      columns: [t.physioId, t.routineId],
      foreignColumns: [routines.physioId, routines.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "share_links_weekly_plan_fk",
      columns: [t.physioId, t.weeklyPlanId],
      foreignColumns: [weeklyPlans.physioId, weeklyPlans.id],
    }).onDelete("cascade"),
    uniqueIndex("share_links_code_unique").on(t.code),
    index("share_links_customer_idx").on(t.physioId, t.customerId),
    // One live link per target; revoking frees the slot for a regenerated one.
    uniqueIndex("share_links_live_customer_unique")
      .on(t.customerId)
      .where(sql`${t.target} = 'customer' and ${t.revokedAt} is null`),
    uniqueIndex("share_links_live_routine_unique")
      .on(t.routineId)
      .where(sql`${t.target} = 'routine' and ${t.revokedAt} is null`),
    uniqueIndex("share_links_live_weekly_plan_unique")
      .on(t.weeklyPlanId)
      .where(sql`${t.target} = 'weekly_plan' and ${t.revokedAt} is null`),
    check(
      "share_links_target_ids",
      sql`(${t.target} = 'customer' and ${t.routineId} is null and ${t.weeklyPlanId} is null)
        or (${t.target} = 'routine' and ${t.routineId} is not null and ${t.weeklyPlanId} is null)
        or (${t.target} = 'weekly_plan' and ${t.routineId} is null and ${t.weeklyPlanId} is not null)`,
    ),
    // Crockford base32, lowercase, no i, l, o, u (src/lib/share-links.ts).
    check("share_links_code_format", sql`${t.code} ~ '^[0-9a-hjkmnp-tv-z]{8}$'`),
    check(
      "share_links_slug_format",
      sql`char_length(${t.slug}) between 1 and ${sql.raw(String(SLUG_MAX))}
        and ${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`,
    ),
    check("share_links_open_count", sql`${t.openCount} >= 0`),
    ownRows("share_links_own", t.physioId),
  ],
);

export type ShareLink = typeof shareLinks.$inferSelect;
