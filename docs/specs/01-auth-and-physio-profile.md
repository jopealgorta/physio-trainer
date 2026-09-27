# 01 · Auth and physio profile

- **Status:** Not started
- **Feature:** Core
- **Depends on:** Scaffold

## Summary

Physios sign in with a magic link or Google, pick a public **handle** during onboarding, and
manage their profile. This spec also builds the security foundation every later spec relies
on: the `physios` table, the RLS-scoped data access helper `withPhysio`, route protection, the
integration-test harness with RLS tests, and an e2e sign-in helper.

## Goals

- Magic-link and Google sign-in via Supabase Auth; sign out.
- First-login onboarding: display name, handle, locale, timezone.
- Settings → Profile page to edit the same fields.
- `withPhysio()` data access helper so Drizzle queries run under RLS.
- Route protection for the `(app)` group; signed-in physios skip the landing/login pages.
- Integration test setup (local Supabase) and e2e auth helper.

## Non-goals

- Branding (logo, accent colour, contact details): spec 09.
- Password sign-in, MFA, account deletion, clinics/teams.

## User stories

- As a physio, I sign in with an email link or Google, without a password.
- As a new physio, I choose a handle like `maria-lopez` that appears in my patients' links.
- As a physio, I can change my name, handle, language and timezone later.

## Data model

`physios` (in `src/db/schema/physios.ts`):

| Column                     | Type                          | Notes                                                                |
| -------------------------- | ----------------------------- | -------------------------------------------------------------------- |
| `id`                       | uuid PK                       | = `auth.users.id`, FK with `on delete cascade`                       |
| `email`                    | text not null                 | copied from auth user                                                |
| `display_name`             | text not null                 | 1–80 chars                                                           |
| `handle`                   | text unique not null          | validated by `isValidHandle` (`src/lib/handles.ts`); store lowercase |
| `locale`                   | text not null default `'en'`  | one of `locales` in `src/i18n/config.ts`                             |
| `timezone`                 | text not null default `'UTC'` | IANA name, validated with `Intl.supportedValuesOf('timeZone')`       |
| `onboarded_at`             | timestamptz null              | null until onboarding is completed                                   |
| `created_at`, `updated_at` | timestamptz                   | per conventions                                                      |

- Row created by a Postgres trigger on `auth.users` insert (`security definer` function) with
  a placeholder handle (`physio-<8 random chars>`) and `display_name` from auth metadata or
  the email local part. Onboarding replaces the placeholder.
- RLS: `select/update` where `id = (select auth.uid())`. No insert/delete policies (trigger
  and cascade handle those).
- Decide here, once, how `updated_at` is maintained (recommended: a shared
  `set_updated_at()` trigger function applied to every table) and document it in
  `docs/architecture.md`.

## Data access helper

`src/server/auth/session.ts`:

- `getSessionPhysio()`: verifies the session with `supabase.auth.getClaims()`, returns
  `{ physioId, claims }` or `null`. Cached per request with React `cache()`.
- `requirePhysio()`: same, but redirects to `/login` when signed out and to `/onboarding` when
  `onboarded_at` is null.

`src/db/rls.ts`:

- `withPhysio(fn)`: calls `requirePhysio()`, opens a Drizzle transaction, runs
  `select set_config('request.jwt.claims', <claims json>, true)` and
  `set local role authenticated`, then `fn(tx, physioId)`. Follow Drizzle's documented
  Supabase RLS pattern; check `node_modules/drizzle-orm` for the current API.
- Physio-facing queries and actions in all later specs use `withPhysio`.

## Routes and UI

| Route            | Kind          | Purpose                                                                                                                                              |
| ---------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/login`         | page          | Email field + "Send link", "Continue with Google". Shows "check your inbox" state.                                                                   |
| `/auth/callback` | route handler | Exchanges the code for a session, then redirects to `next` param (validated same-origin) or `/dashboard`.                                            |
| `/auth/confirm`  | route handler | Handles email OTP `token_hash` links (magic link).                                                                                                   |
| `/onboarding`    | page          | Display name, handle (live availability check + preview of a link, e.g. `physiotrainer.app/maria-lopez/…`), locale, timezone (default from browser). |
| `/settings`      | page          | Profile section with the same fields; sign-out button. Later specs add sections (branding, …).                                                       |
| `/logout`        | server action | Signs out and redirects to `/`.                                                                                                                      |

- `src/proxy.ts`: after `updateSession`, redirect signed-out requests to `(app)` routes
  (`/dashboard`, `/customers`, `/library`, `/routines`, `/plans`, `/settings`, `/onboarding`)
  to `/login?next=<path>`. The proxy only checks for a session; `requirePhysio()` in
  layouts/actions stays the real check.
- `(app)/layout.tsx` calls `requirePhysio()` and shows the physio's name and avatar initial
  in the sidebar with a menu (Settings, Sign out).
- Landing page: signed-in physios see "Open dashboard" as the primary CTA.

## Behaviour and rules

1. Handle: 3–30 chars, `[a-z0-9-]`, no leading/trailing/double hyphen, not in
   `RESERVED_HANDLES`, unique. Suggest one from `slugify(display_name)`, adding `-2`, `-3`… if taken.
2. Changing the handle does not break existing patient links: links resolve by code and
   redirect to the canonical handle (spec 10). Warn in the UI anyway.
3. Locale change sets the `NEXT_LOCALE` cookie and persists to `physios.locale`.
4. `next` redirect parameter must be a relative path starting with `/` (no `//`, no scheme).
5. Magic-link emails use Supabase's templates in v1; customise the copy in `supabase/config.toml`.

## Security and privacy

- Session verification uses `getClaims()` (validates the JWT). Never trust `getSession()` on the server.
- RLS policy tests: physio A cannot select or update physio B's row, even through `withPhysio`
  with A's claims and an explicit `where id = B`.
- Google OAuth client id/secret are configured in the Supabase dashboard (and
  `supabase/config.toml` `[auth.external.google]` for local dev via env), never committed.

## i18n

Namespaces: `Login`, `Onboarding`, `Settings.profile`, `Auth.errors`.

## Acceptance criteria

- [ ] A new user can sign in with a magic link (local Supabase Inbucket/Mailpit) and lands on `/onboarding`.
- [ ] Google sign-in works when credentials are configured, and is hidden when they are not.
- [ ] Onboarding rejects reserved, invalid and taken handles with clear messages.
- [ ] Signed-out visits to `/customers` redirect to `/login?next=/customers` and return there after sign-in.
- [ ] Settings updates name, handle, locale, timezone; sign out works.
- [ ] `withPhysio` exists, is used by all profile queries, and RLS tests prove isolation.
- [ ] `pnpm test:int` runs integration tests against local Supabase; CI runs them (`supabase/setup-cli` + `supabase start`).
- [ ] Playwright has a helper that signs in a seeded test physio without email (e.g. admin API `generateLink` or a seeded session), used by later e2e tests.

## Test plan

- Unit: handle suggestion, `next` param sanitiser, timezone validation.
- Integration: trigger creates `physios` row; RLS isolation; handle uniqueness.
- E2E: onboarding flow; protected route redirect; settings update.

## Open questions

1. Product name and domain for links (the scaffold uses "Physio Trainer")?
2. Should Google sign-in ship in v1, or only once you have the Google Cloud credentials?

## Decisions made during implementation

(Fill in while building.)
