import { sql } from "drizzle-orm";
import { boolean, check, pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
    // Branding (docs/specs/09-physio-branding.md). null = not set / app default.
    clinicName: text(),
    logoPath: text(),
    accentColor: text(),
    contactEmail: text(),
    contactPhone: text(),
    website: text(),
    showContactToPatients: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [
    check(
      "physios_handle_format",
      sql`${table.handle} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(${table.handle}) between 3 and 30`,
    ),
    check("physios_display_name_length", sql`char_length(${table.displayName}) between 1 and 80`),
    check("physios_clinic_name_length", sql`char_length(${table.clinicName}) between 1 and 80`),
    check("physios_accent_color_format", sql`${table.accentColor} ~ '^#[0-9a-f]{6}$'`),
    // The logo must live in the physio's own Storage folder (same rule as the bucket policies).
    check(
      "physios_logo_path_own",
      sql`${table.logoPath} ~ ('^' || ${table.id}::text || '/logo-[0-9a-f-]{36}\\.(png|webp|jpg)$')`,
    ),
    check(
      "physios_contact_email_length",
      sql`char_length(${table.contactEmail}) between 3 and 254`,
    ),
    check("physios_contact_phone_format", sql`${table.contactPhone} ~ '^\\+[0-9]{7,15}$'`),
    check(
      "physios_website_format",
      sql`${table.website} ~ '^https://' and char_length(${table.website}) <= 2048`,
    ),
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
