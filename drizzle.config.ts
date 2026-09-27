import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: [".env.local", ".env"] });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  // Migrations live with the Supabase project so `supabase db reset` applies them.
  out: "./supabase/migrations",
  migrations: { prefix: "supabase" },
  casing: "snake_case",
  entities: { roles: { provider: "supabase" } },
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
});
