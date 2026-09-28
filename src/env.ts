import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Typed, validated environment. Import `env` instead of reading `process.env` directly.
 * Set SKIP_ENV_VALIDATION=1 for builds that run without real secrets (CI, Docker).
 */
export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
    // Bypasses RLS. Only for server code that resolves patient share links
    // (see docs/architecture.md → "Data access").
    SUPABASE_SECRET_KEY: z.string().min(1),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
    // Shows "Continue with Google" on /login once the provider is configured in Supabase.
    NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: z.stringbool().default(false),
    // Hides the magic-link form, e.g. while Supabase has no custom SMTP (its built-in sender
    // only delivers to project team members). Ignored when Google is disabled too.
    NEXT_PUBLIC_AUTH_EMAIL_ENABLED: z.stringbool().default(true),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED,
    NEXT_PUBLIC_AUTH_EMAIL_ENABLED: process.env.NEXT_PUBLIC_AUTH_EMAIL_ENABLED,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
