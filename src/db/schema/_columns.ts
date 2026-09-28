import { timestamp } from "drizzle-orm/pg-core";

/**
 * created_at / updated_at for every table. updated_at is maintained by the shared
 * set_updated_at() trigger: attach it in the table's custom migration (a test enforces it).
 */
export const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
};
