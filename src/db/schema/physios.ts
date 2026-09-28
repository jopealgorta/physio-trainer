import { sql } from "drizzle-orm";
import { check, pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { authenticatedRole, authUid, authUsers } from "drizzle-orm/supabase";

import { timestamps } from "./_columns";

/** One row per physio, 1:1 with auth.users. Created by the handle_new_user() trigger. */
export const physios = pgTable(
  "physios",
  {
    id: uuid()
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    email: text().notNull(),
    displayName: text().notNull(),
    handle: text().notNull().unique(),
    locale: text().notNull().default("en"),
    timezone: text().notNull().default("UTC"),
    onboardedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    check(
      "physios_handle_format",
      sql`${table.handle} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(${table.handle}) between 3 and 30`,
    ),
    check("physios_display_name_length", sql`char_length(${table.displayName}) between 1 and 80`),
    pgPolicy("physios_select_own", {
      for: "select",
      to: authenticatedRole,
      using: sql`${table.id} = ${authUid}`,
    }),
    pgPolicy("physios_update_own", {
      for: "update",
      to: authenticatedRole,
      using: sql`${table.id} = ${authUid}`,
      withCheck: sql`${table.id} = ${authUid}`,
    }),
  ],
);

export type Physio = typeof physios.$inferSelect;
