import { test as base, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set: run pnpm db:start and fill .env.local`);
  return value;
}

const admin = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SECRET_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const sql = postgres(requireEnv("DATABASE_URL"), { prepare: false, max: 2 });

export type E2EPhysio = { id: string; email: string; displayName: string; handle: string };

/** Creates a physio through the admin API (no email). Onboarded physios get a known handle. */
export async function createPhysio(
  options: {
    onboarded?: boolean;
    displayName?: string;
    handle?: string;
    /** Extra sign-up metadata, e.g. Google's `avatar_url`. */
    userMetadata?: Record<string, unknown>;
  } = {},
): Promise<E2EPhysio> {
  const suffix = crypto.randomUUID().slice(0, 8);
  const email = `e2e-${suffix}@example.test`;
  const displayName = options.displayName ?? `E2E Physio ${suffix}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: displayName, ...options.userMetadata },
  });
  if (error) throw error;
  const id = data.user.id;

  if (options.onboarded || options.handle) {
    const handle = options.handle ?? `e2e-${suffix}`;
    await sql`
      update public.physios
      set handle = ${handle}, onboarded_at = ${options.onboarded ? sql`now()` : null}
      where id = ${id}`;
    return { id, email, displayName, handle };
  }
  const [row] = await sql<{ handle: string }[]>`select handle from public.physios where id = ${id}`;
  return { id, email, displayName, handle: row.handle };
}

/** Replaces the auth user's metadata, as a provider does when the profile changes. */
export async function setUserMetadata(id: string, metadata: Record<string, unknown>) {
  const { error } = await admin.auth.admin.updateUserById(id, { user_metadata: metadata });
  if (error) throw error;
}

export async function deletePhysio(physio: E2EPhysio): Promise<void> {
  // Tolerant of a user already deleted by the test itself (e.g. the redirect-loop test).
  await admin.auth.admin.deleteUser(physio.id).catch(() => {});
}

/** Cleanup for users created through the real sign-up flow. */
export async function deleteUserByEmail(email: string): Promise<void> {
  await sql`delete from auth.users where email = ${email}`;
}

/** Deletes only the physios row, simulating an account whose profile disappeared. */
export async function deletePhysioRow(id: string): Promise<void> {
  await sql`delete from public.physios where id = ${id}`;
}

/**
 * Signs in without email: same /auth/confirm route the magic link uses. Returns that link
 * (now used up).
 */
export async function signIn(page: Page, physio: E2EPhysio, next = "/dashboard"): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: physio.email,
  });
  if (error) throw error;
  const params = new URLSearchParams({
    token_hash: data.properties.hashed_token,
    type: "email",
    next,
  });
  const link = `/auth/confirm?${params}`;
  await page.goto(link);
  return link;
}

/**
 * `physio`: an onboarded physio, deleted after the test.
 * `physioPage`: `page` signed in as that physio, on /dashboard.
 */
export const test = base.extend<{ physio: E2EPhysio; physioPage: Page }>({
  physio: async ({}, use) => {
    const physio = await createPhysio({ onboarded: true });
    await use(physio);
    await deletePhysio(physio);
  },
  physioPage: async ({ page, physio }, use) => {
    await signIn(page, physio);
    await expect(page).toHaveURL(/\/dashboard$/);
    await use(page);
  },
});

export { expect };
