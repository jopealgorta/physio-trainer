import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/env";

import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pgClient?: ReturnType<typeof postgres> };

// Reuse the connection across hot reloads in development.
// `prepare: false` is required by Supabase's transaction pooler.
const client = globalForDb.pgClient ?? postgres(env.DATABASE_URL, { prepare: false });
if (process.env.NODE_ENV !== "production") globalForDb.pgClient = client;

/**
 * Drizzle client connected as the database owner: it BYPASSES Row Level Security.
 * Physio-facing code must go through the RLS-scoped helper introduced in
 * docs/specs/01-auth-and-physio-profile.md; see docs/architecture.md → "Data access".
 */
export const db = drizzle(client, { schema, casing: "snake_case" });
