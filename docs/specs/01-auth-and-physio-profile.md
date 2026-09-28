# 01 · Auth and physio profile

- **Status:** In progress
- **Feature:** Core
- **Depends on:** Scaffold

## Summary

Physios sign in with a magic link or Google, pick a public **handle** during onboarding, and
manage their profile. This spec also builds the security foundation every later spec relies
on: the `physios` table, the RLS-scoped data access helpers (`runAsPhysio`, `withPhysio`),
route protection, closing the Supabase Data API, the integration-test harness with RLS and
schema-convention tests, and an e2e sign-in helper.

## Goals

- Magic-link and Google sign-in via Supabase Auth; sign out.
- Google sign-in ships in v1 but stays hidden until `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true`.
- First-login onboarding: display name, handle, locale, timezone.
- Settings → Profile page to edit the same fields.
- `withPhysio()` data access helper so Drizzle queries run under RLS.
- Route protection for the `(app)` group; signed-in physios skip the login page.
- Integration test setup (local Supabase) and e2e auth helper + fixture.

## Non-goals

- Branding (logo, accent colour, contact details): spec 09.
- Password sign-in, MFA, account deletion, clinics/teams.
- Changing the sign-in email. `physios.email` is copied once at sign-up; there is no UI to
  change it in v1.

## User stories

- As a physio, I sign in with an email link or Google, without a password.
- As a physio, I can request the link on my laptop and open it on my phone.
- As a new physio, I choose a handle like `maria-lopez` that appears in my patients' links.
- As a physio, I can change my name, handle, language and timezone later.

## Data model

`physios` (in `src/db/schema/physios.ts`):

| Column                     | Type                          | Notes                                                                |
| -------------------------- | ----------------------------- | -------------------------------------------------------------------- |
| `id`                       | uuid PK                       | = `auth.users.id`, FK with `on delete cascade`                       |
| `email`                    | text not null                 | copied from auth user at sign-up                                     |
| `display_name`             | text not null                 | 1–80 chars (check constraint)                                        |
| `handle`                   | text unique not null          | validated by `isValidHandle` (`src/lib/handles.ts`); store lowercase |
| `locale`                   | text not null default `'en'`  | one of `locales` in `src/i18n/config.ts`                             |
| `timezone`                 | text not null default `'UTC'` | IANA name, validated with `isValidTimeZone` (`src/lib/timezones.ts`) |
| `onboarded_at`             | timestamptz null              | null until onboarding is completed                                   |
| `created_at`, `updated_at` | timestamptz                   | from the shared `timestamps` column helper                           |

- **Check constraints** (defense in depth; the app validates first): `handle` matches
  `^[a-z0-9]+(-[a-z0-9]+)*$` and is 3–30 chars; `display_name` is 1–80 chars. The reserved-handle
  list is app-only.
- **RLS** declared in Drizzle (`pgPolicy`, `.enableRLS()`): `select` and `update` to
  `authenticated` where `id = (select auth.uid())` (update has the same `with check`). No insert
  or delete policies: the trigger and the FK cascade handle those.
- **Column helper** `timestamps` in `src/db/schema/_columns.ts`: `createdAt` and `updatedAt`,
  both `timestamptz not null default now()`. Every later table spreads it.

### Functions and triggers (custom migration)

Drizzle cannot express these, so they live in one migration created with
`drizzle-kit generate --custom`, separate from generated SQL.

| Object                             | Kind                                                           | Behaviour                                                                                                                                                                                                                                              |
| ---------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `public.set_updated_at()`          | trigger function                                               | Sets `new.updated_at = now()`. Attached `before update ... for each row` to `physios`, and to **every** later table with an `updated_at` column (each spec adds it in its own custom migration).                                                       |
| `public.handle_new_user()`         | trigger function, `security definer`, `set search_path = ''`   | `after insert on auth.users`: inserts the `physios` row. Handle = `physio-` + 8 hex chars. `display_name` = metadata `full_name`, else `name`, else the email local part, trimmed and truncated to 80.                                                 |
| `public.is_handle_available(text)` | function, `security definer`, `stable`, `set search_path = ''` | Returns `true` when no physio other than `auth.uid()` has that handle. Needed because RLS hides other physios' rows. Execute revoked from `public`/`anon`, granted to `authenticated`. Leaks only a boolean; handles are public in share links anyway. |

The unique index on `handle` stays the real guard: a `23505` on save maps to `handleTaken`, so
two physios racing for the same handle is safe.

### Supabase Data API closed

The app never reads or writes tables through PostgREST or GraphQL; all table access is
server-side through Drizzle. With Supabase's defaults, a signed-in physio could call PostgREST
directly with their JWT and update their own row, skipping app validation (e.g. setting a
reserved handle), and the same would hold for every later table.

- Local: `supabase/config.toml` `[api] enabled = false` (PostgREST is not started;
  `schemas = []` is not enough, PostgREST falls back to `public`).
- Hosted: Dashboard → Data API → disable it (documented in the README setup section).
- Auth and Storage are separate services and keep working. RLS stays as the second guard for
  `withPhysio`.
- Browser code uses supabase-js only for Auth (and Storage in later specs).

## Session and data access

| Helper                    | File                         | Behaviour                                                                                                                                                                                                                        |
| ------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getSessionPhysio()`      | `src/server/auth/session.ts` | `supabase.auth.getClaims()` → `{ physioId, claims } \| null`. No DB access. `cache()`d per request.                                                                                                                              |
| `runAsPhysio(claims, fn)` | `src/db/rls.ts`              | Opens a Drizzle transaction, runs `select set_config('request.jwt.claims', <claims json>, true)` and `set local role authenticated`, then `fn(tx, physioId)`. No Next.js imports, so integration tests call it with test claims. |
| `withPhysio(fn)`          | `src/server/auth/session.ts` | Requires a **session** (redirects to `/login` when signed out), then `runAsPhysio(claims, fn)`. Does not require onboarding.                                                                                                     |
| `requirePhysio()`         | `src/server/auth/session.ts` | Session + profile row (via `withPhysio`). Redirects to `/login` when signed out and to `/onboarding` when `onboarded_at` is null. Returns `{ physioId, profile }`. `cache()`d. Used by `(app)/layout.tsx`.                       |

- `withPhysio` requires only a session because `requirePhysio` reads the profile through
  `withPhysio`, and onboarding must save before `onboarded_at` is set.
- Physio-facing queries and actions in all later specs use `withPhysio`, and also filter by
  `physio_id`.
- **Domain code** in `src/server/physios/`:
  - `schemas.ts`: zod `profileSchema` (trimmed `displayName` 1–80; `handle` lowercased +
    `isValidHandle`; `locale` via `isLocale`; `timezone` via `isValidTimeZone`).
  - `queries.ts`: reads taking `(tx, physioId)`: `getProfile`, `suggestHandle(displayName)`.
  - `mutations.ts`: writes taking `(tx, physioId, input)`: `completeOnboarding`,
    `updateProfile`. Return `{ ok: true, data } | { ok: false, error }`.
  - `actions.ts` (`"use server"`): thin wrappers: parse → `withPhysio(tx => mutation(...))` →
    set locale cookie → revalidate/redirect. Plus `checkHandleAction(handle)` → `boolean`
    (invalid handles are never available; the form shows rule problems itself, without a
    request).
- `src/server/auth/actions.ts`: `sendMagicLink`, `signInWithGoogle`, `signOut`.

## Auth flows

**Magic link** (`token_hash`, not PKCE, so the link works when opened in a different browser or
device):

1. `/login` → `sendMagicLink` → `signInWithOtp({ email, options: { emailRedirectTo } })`, where
   `emailRedirectTo` is built from `NEXT_PUBLIC_APP_URL` and carries the sanitised `next` path.
2. The magic-link email template (`supabase/templates/magic_link.html`, wired in
   `config.toml`) links to `/auth/confirm` with `token_hash`, `type` and `next`. The exact
   template is proven by the Mailpit e2e test.
3. `/auth/confirm` → `verifyOtp({ type, token_hash })` → post-sign-in step (below).

**Google** (PKCE, env-gated):

1. The "Continue with Google" button renders only when `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` is
   `true`. It posts to `signInWithGoogle` → `signInWithOAuth({ provider: "google",
options: { redirectTo: <APP_URL>/auth/callback?next=… } })` → redirect to the provider.
2. `/auth/callback` → `exchangeCodeForSession(code)` → post-sign-in step.

**Post-sign-in step** (shared by both route handlers):

- Load the profile with `runAsPhysio` using the new session's claims.
- Set the `NEXT_LOCALE` cookie from `physios.locale` (a new device gets the right language).
- Not onboarded → `/onboarding?next=<next>`; onboarded → `<next>` or `/dashboard`.
- Any failure → `/login?error=<code>` (`linkInvalid`, `oauthFailed`, `unknown`).

**Proxy** (`src/proxy.ts`): `updateSession` returns the claims it already validates; a pure
`routeGuard(pathname, search, signedIn)` in `src/lib/auth/route-guard.ts` decides:

- signed out + path under `PROTECTED_PREFIXES` (`/dashboard`, `/customers`, `/library`,
  `/routines`, `/plans`, `/settings`, `/onboarding`) → `/login?next=<path + search>`;
- signed in + `/login` → `/dashboard`;
- otherwise pass through. The landing page stays public.

The proxy only checks for a session; `requirePhysio()` and `withPhysio()` stay the real checks.

**Sign out**: `signOut` server action → `supabase.auth.signOut()` → redirect to `/`. Called from
the settings page and the user menu. There is no `/logout` page (the name stays reserved).

## Routes and UI

All copy in `messages/en.json`; accent colour on `primary`; forms use `<form action>` +
`useActionState`; validation and status messages render in `aria-live` regions (no toast
library).

| Route            | Kind          | Purpose                                                                                                                          |
| ---------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `/login`         | page          | Email + "Send link"; "Continue with Google" when enabled; "Check your inbox" state; `?error=` alert.                             |
| `/auth/confirm`  | route handler | Magic link: `verifyOtp` → post-sign-in step.                                                                                     |
| `/auth/callback` | route handler | Google: `exchangeCodeForSession` → post-sign-in step.                                                                            |
| `/onboarding`    | page          | "Set up your profile": `ProfileForm` in onboarding mode. Requires a session; onboarded physios are redirected to `/dashboard`.   |
| `/settings`      | page          | Profile card (`ProfileForm`, settings mode) and Account card (read-only email, "Sign out"). Later specs add cards (branding, …). |

**`/login`** (`(auth)` group, centred card):

- Email field + "Send link". On success, the card switches to "Check your inbox at `x@y`"
  with a "Use a different email" link.
- When Google is enabled: "Continue with Google" above the email form, with an "or"
  separator.
- `next` is preserved through every step.

**`ProfileForm`** (client component, `src/components/physios/profile-form.tsx`), shared by
onboarding and settings:

- **Display name.**
- **Handle**: lowercased as typed; availability checked 400 ms after typing stops via
  `checkHandle`, with status text (checking / available / taken / reserved / invalid + the rule
  broken); link preview built from `NEXT_PUBLIC_APP_URL`, e.g.
  `physiotrainer.app/maria-lopez/ana-7k2m9qpx`. In onboarding mode the handle follows the
  display name (via `slugify`) until the physio edits the handle field.
- **Language**: native `<select>` over `locales` (only English today).
- **Timezone**: native `<select>` over all IANA zones, labelled like "Europe/Madrid (GMT+2)".
  Onboarding defaults it to the browser's zone. Native beats a combobox here: type-ahead,
  accessible, good on mobile, no new dependency.
- Settings mode: when the handle differs from the saved one, a notice says links already shared
  keep working and redirect to the new handle. After save: inline "Saved".

**Onboarding**: the handle is prefilled server-side with `suggestHandle(display_name)` while the
row still has its `physio-xxxxxxxx` placeholder. "Continue" sets `onboarded_at`, sets the locale
cookie and redirects to `next` or `/dashboard`.

**App shell** (`(app)/layout.tsx` calls `requirePhysio()`):

- Sidebar bottom: `UserMenu` (client) replaces the Settings link: round initial on
  `bg-primary`, name, truncated email; dropdown with Settings and Sign out (a form posting to
  `signOut`). Theme toggle stays beside it.
- Mobile header: the same menu as an avatar button beside the theme toggle.
- Props are serialisable strings only.

**Landing**: signed in → one primary CTA "Open dashboard"; signed out → one CTA "Get started"
(`/login`). The page becomes dynamic because it reads the session.

**New shadcn primitive**: `alert` only.

## Behaviour and rules

1. Handle: 3–30 chars, `[a-z0-9-]`, no leading/trailing/double hyphen, not in
   `RESERVED_HANDLES`, unique.
2. Handle suggestion: `handleCandidates(displayName)` in `src/lib/handles.ts` yields
   `slugify(name)`, then `-2`, `-3`, … (truncating the base so the suffix fits 30 chars), skipping
   reserved handles; names that slugify to fewer than 3 chars fall back to a `physio` base. It
   yields at most 20 candidates. One SQL query returns the first candidate for which
   `is_handle_available` is true; if none is, the form keeps the current handle and the physio
   picks one.
3. Changing the handle does not break existing patient links: links resolve by code and
   redirect to the canonical handle (spec 10). The settings form warns anyway.
4. Locale change sets the `NEXT_LOCALE` cookie and persists to `physios.locale`. Sign-in sets
   the cookie from the profile.
5. `next` redirect parameter: `safeNextPath()` in `src/lib/redirects.ts` accepts only a
   relative path starting with a single `/`. It rejects `//`, `/\`, any scheme, and encoded
   variants of those, and falls back to `/dashboard`.
6. Timezone: `isValidTimeZone()` uses an `Intl.DateTimeFormat` try/catch, not
   `Intl.supportedValuesOf`, which omits `"UTC"` in V8.
7. Magic-link emails use Supabase's mailer with our template in v1 (copy lives in
   `supabase/templates/magic_link.html`).

## Security and privacy

- Session verification uses `getClaims()` (validates the JWT). Never trust `getSession()` on
  the server.
- Two independent guards on every physio query: RLS via `runAsPhysio`/`withPhysio`, and an
  explicit `physio_id`/`id` filter.
- Data API closed (see above), so RLS is never the only thing standing between a browser and a
  table.
- `security definer` functions pin `search_path = ''` and schema-qualify every object.
- RLS policy tests: physio A cannot select or update physio B's row, even through
  `runAsPhysio` with A's claims and an explicit `where id = B`.
- Google OAuth client id/secret are configured in the Supabase dashboard (hosted) and via
  `env(...)` in `supabase/config.toml` `[auth.external.google]` (local), never committed.

## Configuration

| Item                               | Where                   | Notes                                                                                               |
| ---------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED`  | `src/env.ts` (client)   | Boolean, default `false`. Shows the Google button.                                                  |
| Google client id / secret          | `.env` for Supabase CLI | Read by `[auth.external.google]` via `env(...)`; names documented in `.env.example`.                |
| `[api] enabled = false`            | `supabase/config.toml`  | Data API closed.                                                                                    |
| `additional_redirect_urls`         | `supabase/config.toml`  | Globs covering `/auth/**` on `localhost` and `127.0.0.1` for any port (dev on :3000, e2e on :3100). |
| `[auth.email.template.magic_link]` | `supabase/config.toml`  | Points at `supabase/templates/magic_link.html`.                                                     |
| Playwright `webServer.env`         | `playwright.config.ts`  | Sets `NEXT_PUBLIC_APP_URL` to the e2e base URL so links and redirects target :3100.                 |
| Hosted checklist                   | README                  | Disable Data API, set Site URL + redirect URLs, paste magic-link template, enable Google provider.  |

## i18n

Namespaces: `Login`, `Onboarding`, `ProfileForm` (field labels and handle statuses shared by
onboarding and settings), `Settings.profile`, `Settings.account`, `UserMenu`, `Auth.errors`.
`Landing` gains the signed-in CTA.

## Acceptance criteria

- [ ] A new user can sign in with a magic link (local Mailpit) and lands on `/onboarding`.
- [ ] Google sign-in is hidden when `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` is not `true`, and the
      button starts the OAuth redirect when it is (real flow verified manually once
      credentials exist).
- [ ] Onboarding rejects reserved, invalid and taken handles with clear messages.
- [ ] Signed-out visits to `/customers` redirect to `/login?next=/customers` and return there
      after sign-in (via onboarding for a new physio).
- [ ] Settings updates name, handle, locale, timezone; sign out works.
- [ ] `withPhysio` exists, is used by all profile queries, and RLS tests prove isolation.
- [ ] The Data API does not serve `public` tables (`/rest/v1/physios` is refused).
- [ ] Integration tests fail if a `public` table lacks RLS or a table with `updated_at` lacks
      the `set_updated_at` trigger.
- [ ] `pnpm test:int` runs integration tests against local Supabase; CI runs them.
- [ ] Playwright has a helper and a `physioPage` fixture that sign in a seeded test physio
      without email, used by later e2e tests.

## Test plan

**Unit** (`pnpm test`, no database; `pnpm check` stays DB-free):

- `handleCandidates` (slugify, suffix truncation, short/empty names, reserved skipping).
- `safeNextPath` (`//evil`, `/\evil`, schemes, `javascript:`, encoded `%2F%2F`, empty).
- `isValidTimeZone` (`UTC` accepted, garbage rejected) and `timeZoneOptions` labels.
- `routeGuard` decisions, plus a test that every route folder under `src/app/(app)` is covered
  by `PROTECTED_PREFIXES` (same style as the `RESERVED_HANDLES` test).
- `profileSchema` (trim, lowercase, error codes).
- `ProfileForm` with Testing Library: handle follows the name until touched (onboarding only);
  status rendering.

**Integration** (`pnpm test:int`, `vitest.int.config.mts`: node environment,
`src/**/*.int.test.ts`, dotenv `.env.local`, `server-only` aliased to an empty module). Helper
`createTestPhysio({ onboarded })` in `src/test/int/` creates a user through the admin API with a
unique email (tests can run in parallel), returns `{ id, claims }`, and deletes the user after
the suite (the cascade removes the row).

- `physios.int.test.ts`: trigger creates the row (placeholder handle, name from metadata or
  email); cascade on user delete; `updated_at` bumps on update; check constraints reject bad
  handles.
- `rls.int.test.ts`: A sees only A's row; `where id = B` returns nothing; updating B affects 0
  rows; insert and delete are denied; no claims ⇒ nothing visible; `is_handle_available`
  true / false / own handle.
- `profile.int.test.ts`: mutations through `runAsPhysio`: save, taken handle ⇒ `handleTaken`,
  onboarding sets `onboarded_at`, `suggestHandle` skips taken handles.
- `schema-conventions.int.test.ts`: every `public` table has RLS enabled; every table with
  `updated_at` has the `set_updated_at` trigger.
- `data-api.int.test.ts`: `GET /rest/v1/physios` with a physio JWT is refused.

**E2E** (Playwright; needs `pnpm db:start`; config loads `.env.local`). `e2e/helpers/auth.ts`:

- `createPhysio({ onboarded, handle?, displayName? })`: admin API + direct `postgres` update for
  onboarded fields.
- `signIn(page, physio, { next })`: admin `generateLink` → `hashed_token` → `/auth/confirm`.
- `physioPage` fixture (`test.extend`): onboarded, signed-in page with cleanup; later specs use
  it.

Specs:

- `e2e/auth.spec.ts`: real magic link via the Mailpit API (`:54324`) → `/onboarding`; Google
  button hidden; `/customers` → `/login?next=/customers` → sign in → `/customers`; signed-in
  `/login` → `/dashboard`; sign out → `/`, then `/dashboard` → `/login`.
- `e2e/onboarding.spec.ts`: suggestion prefilled; reserved, invalid and taken handles each show
  their message; valid handle → `/dashboard` with the name in the user menu.
- `e2e/settings.spec.ts`: edit name, handle, timezone → "Saved"; handle-change notice.
- `e2e/smoke.spec.ts`: workspace navigation uses `physioPage`; landing asserts the signed-out
  CTA.

## CI

- `check` job unchanged (placeholder env, no database).
- New `integration` job: `pnpm exec supabase start` (the CLI is a pinned devDependency)
  excluding services this spec
  does not need (studio, imgproxy, vector, logflare, edge-runtime, realtime) → export real keys
  from `supabase status -o env` into `$GITHUB_ENV` → `pnpm db:generate` +
  `git diff --exit-code supabase/migrations` (catches schema changes without a generated
  migration) → `pnpm test:int`.
- `e2e` job: same Supabase boot (Mailpit stays on) → `pnpm test:e2e`.
- The two database jobs run in parallel and fail independently.

## Open questions

Resolved with the user on 2026-09-27:

1. **Product name and domain** → keep "Physio Trainer" as the working name (one place in
   `messages/en.json`). Links and previews are built from `NEXT_PUBLIC_APP_URL`, so the domain is
   decided at deploy time with no code change.
2. **Google sign-in in v1** → build it now, env-gated. Credentials get added later with no code
   change; tests cover the hidden state.

## Decisions made during design

Agreed with the user on 2026-09-27 before planning:

- **Magic link uses `token_hash` via `/auth/confirm`**, not PKCE, so links work across
  browsers and devices. Google uses PKCE via `/auth/callback`. The e2e helper reuses
  `/auth/confirm`, so tests never need an email.
- **`next` survives onboarding**: the post-sign-in step sends new physios to
  `/onboarding?next=…`.
- **`withPhysio` requires a session, not onboarding** (the original draft had it call
  `requirePhysio`, which would be circular). `runAsPhysio(claims, fn)` is split out so
  integration tests can drive RLS without Next.js.
- **`updated_at` is maintained by a shared `set_updated_at()` trigger** on every table, guarded
  by an integration test.
- **Handle availability via a `security definer` function** (`is_handle_available`), because
  RLS hides other physios' rows; the unique index remains the real guard.
- **Supabase Data API closed** for `public`; all table access goes through Drizzle.
- **Services split from actions** (`queries.ts` / `mutations.ts` take a transaction) so they
  are testable through `runAsPhysio`.
- **Native `<select>`** for language and timezone; `alert` is the only new shadcn primitive.
- **`ProfileForm` namespace** added for copy shared by onboarding and settings.
- **Landing** shows a single CTA per state.

## Decisions made during planning

Found while writing `docs/plans/01-auth-and-physio-profile.md` (2026-09-27), by probing local
Supabase:

- **Data API off via `[api] enabled = false`**: with `schemas = []` PostgREST still served
  `public`. With the API off, REST and GraphQL return 503 while Auth and Storage keep working.
- **`withPhysio` lives in `src/server/auth/session.ts`** next to `getSessionPhysio` and
  `requirePhysio`; `src/db/rls.ts` only has `runAsPhysio`. Keeps `db` free of Next.js imports
  and avoids an import cycle.
- **Both `magic_link` and `confirmation` email templates** point at `/auth/confirm`: new users
  get `magic_link` locally, but hosted projects with confirmations on send `confirmation`.
  `pkce_` token hashes verify from a different browser, confirming the cross-device choice.
- **Redirect allow-list uses port globs** (`http://localhost:*/auth/**`): a non-allow-listed
  `emailRedirectTo` silently falls back to the Site URL and breaks the link.
- **`checkHandleAction` returns a boolean**; handle rule problems are computed client-side.
- **CI uses `pnpm exec supabase`** (lockfile-pinned CLI) rather than `supabase/setup-cli`.

## Decisions made during implementation

(Fill in while building.)
