# Architecture

This is the source of truth for decisions that cut across features. Feature specs in
[`docs/specs/`](./specs/README.md) build on it. If a spec contradicts this file, stop and fix
one of them before writing code.

## Product in one paragraph

Physio Trainer lets a physiotherapist manage their **customers** (patients), record their
**injury cases**, build **routines** from a personal **exercise library** (with videos and
media, organised in categories), group routines into **weekly plans**, and share everything
with the patient through a **clean link that needs no account**. Patients can follow a guided
workout, log sessions and pain, and download a PDF. Everything a physio creates is private to
that physio.

## Decisions log (from the initial brainstorm, 2026-09-27)

| Topic                | Decision                                                                                                                                                                                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenancy              | Multi-tenant from day one; one physio per account; data model leaves room for clinics later. No billing yet.                                                                                                                                                                           |
| Languages            | i18n from the start (next-intl). Locale is **not** in the URL. Physio UI locale from profile/cookie; patient pages use the customer's `locale`. Signed-out visitors get `Accept-Language` and a switcher. Ships with `en` and `es` (Rioplatense); every feature ships in every locale. |
| Privacy              | Health data. Tenant isolation enforced by Postgres RLS plus explicit filters. No health data in URLs or link previews.                                                                                                                                                                 |
| Patient access       | No account. Share link per customer (always shows what is currently active) plus optional links for a single routine/plan. Revocable, optional expiry, optional 4-digit PIN.                                                                                                           |
| Link format          | `/{physio-handle}/{slug}-{code}`, e.g. `/maria-lopez/ana-7k2m9qpx`. `code` is 8 random Crockford base32 chars and is the only lookup key; `handle` and `slug` are cosmetic and redirect to canonical when stale.                                                                       |
| Patient input        | Patients log sessions (done, pain 0–10, comment) from v1 (feature D).                                                                                                                                                                                                                  |
| Routine types        | **Single routine** (shared on its own) and **weekly plan** (Mon–Sun, each day has 0..n routines, e.g. gym + rehab).                                                                                                                                                                    |
| Weekly plans         | One repeating 7-day template. Routines are attached by reference (edit once, updates every day); "make a separate copy" to diverge. Optional per-entry label ("Morning").                                                                                                              |
| Progression          | "Copy into next phase" with start/end dates (feature B) rather than multi-week plans.                                                                                                                                                                                                  |
| Categories           | Two levels (category → sub-category) plus free tags. Rehab and gym exercises share one library.                                                                                                                                                                                        |
| Media                | YouTube links only in v1 (spec 03); uploads (≤ 50 MB, Supabase Storage) and Vimeo are deferred.                                                                                                                                                                                        |
| Export               | Branded PDF (with QR code back to the live link) and Excel `.xlsx`.                                                                                                                                                                                                                    |
| Login                | Supabase Auth: magic link + Google.                                                                                                                                                                                                                                                    |
| Platform             | Responsive web; physio app installable with an offline fallback page (spec 18); patient page mobile-first and installable (per-link manifest).                                                                                                                                         |
| Design               | Minimal, neutral palette, one accent colour (overridable per physio on patient-facing surfaces), light + dark.                                                                                                                                                                         |
| In scope now         | Features A (templates), B (phases), C (workout mode), D (logging), E (link previews), F (branding), H (body areas), I (version history), J (visit notes).                                                                                                                              |
| Out of scope for now | Seed library/CSV import (G), outcome measures (K), offline patient view (L), AI assist (M), GDPR tooling (N), reminders (O), clinics/teams, billing.                                                                                                                                   |

## Stack

| Concern    | Choice                                                                                                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, React 19, Server Components, Server Actions, `proxy.ts`). **Read `node_modules/next/dist/docs/` before using an API**: this version differs from older training data. |
| Language   | TypeScript (strict)                                                                                                                                                                           |
| UI         | Tailwind CSS v4, shadcn/ui (`radix-mira` style from preset `b1D0dxHE`, neutral, Radix primitives in `src/components/ui`), lucide-react icons, Outfit font (`next/font/google`), next-themes   |
| Database   | Supabase Postgres 17. Drizzle ORM for schema, migrations and queries                                                                                                                          |
| Auth       | Supabase Auth via `@supabase/ssr` (cookie sessions refreshed in `src/proxy.ts`)                                                                                                               |
| Files      | Supabase Storage (private buckets, signed URLs)                                                                                                                                               |
| Validation | zod v4 (also for env via `@t3-oss/env-nextjs`, see `src/env.ts`)                                                                                                                              |
| i18n       | next-intl without i18n routing (`src/i18n/`, `messages/*.json`)                                                                                                                               |
| Tests      | Vitest + Testing Library (unit/component), Vitest against local Supabase (integration), Playwright (e2e, desktop + mobile projects)                                                           |
| Hosting    | Vercel (app) + Supabase (database, auth, storage)                                                                                                                                             |

## Repository layout

```
src/
  app/
    (marketing)/          public landing page
    (auth)/               login, auth callback, onboarding
    (app)/                physio workspace (sidebar shell); requires a signed-in physio
    (patient)/[handle]/[slug]/   public patient page (no account)
    api/                  route handlers (health, exports, ...)
  components/
    ui/                   shadcn primitives: do not put feature logic here
    <domain>/             feature components (customers/, library/, routines/, ...)
  config/                 static config (navigation, ...)
  db/
    index.ts              Drizzle client (owner connection, bypasses RLS)
    schema/<domain>.ts    one file per domain, re-exported from schema/index.ts
  i18n/                   locale config + next-intl request config
  lib/                    framework-agnostic helpers (pure, unit-tested)
  server/<domain>/        server-only code per domain:
    queries.ts            reads, taking (tx, physioId)
    mutations.ts          writes, taking (tx, physioId, input); testable via runAsPhysio
    actions.ts            Server Actions ("use server"), thin: validate → withPhysio(mutation) → revalidate
    schemas.ts            zod input schemas shared by forms and actions
  proxy.ts                session refresh + route protection
messages/                 translations (en.json, es.json)
supabase/                 Supabase CLI project; migrations generated by drizzle-kit
e2e/                      Playwright tests
docs/                     this file, feature specs
```

## Tenancy and data access

These rules are the security model. Every spec must follow them.

1. **Every physio-owned table** has `physio_id uuid not null references physios(id) on delete cascade`,
   has RLS enabled, and has policies allowing `select/insert/update/delete` only when
   `physio_id = (select auth.uid())`. Child tables (e.g. `routine_items`) carry `physio_id`
   too, so every policy is a single-column check with no joins. Index `physio_id` everywhere.
2. **Physio-facing code** reads and writes through `withPhysio(fn)` (built in spec 01): it requires
   a verified session and calls `runAsPhysio(claims, fn)`, a Drizzle transaction that sets
   `request.jwt.claims` and runs `set local role authenticated`, so RLS applies to Drizzle
   queries. Queries _also_ filter by `physio_id` explicitly. Two independent guards.
   Integration tests call `runAsPhysio` directly with test claims.
3. **Patient-facing code** (no session) lives only in `src/server/patient/`. It uses the owner
   `db` connection (RLS bypassed) and must:
   - resolve the share link by `code` first (not revoked, not expired, PIN satisfied);
   - derive every other id from the link (customer → routines/plans). It never trusts ids
     from the client without checking they belong to the link's customer;
   - return only the fields the patient page needs (no visit notes, no case details beyond
     what the spec allows).
4. **Storage**: private buckets. Object paths start with `{physio_id}/`. Storage RLS policies
   check the first path segment against `auth.uid()`. Patients get short-lived signed URLs
   generated server-side after link resolution.
   Exception: the public `branding` bucket (spec 09) holds physio logos only (no patient data);
   its write and delete policies still check the first path segment against `auth.uid()`.
5. **Secrets**: `SUPABASE_SECRET_KEY` and `DATABASE_URL` are server-only (`src/env.ts`
   `server` block). Never import `@/db` or `@/lib/supabase/server` from a Client Component
   (both import `server-only`).
6. **No Data API**: the Supabase Data API (PostgREST/GraphQL) does not expose `public`
   (`[api] enabled = false` locally, disabled in the hosted dashboard). All table access is
   server-side through Drizzle; browser code uses supabase-js only for Auth and Storage. This
   stops a signed-in user from writing rows directly and skipping app validation (spec 01).

## Domain model

Tables are owned by the spec that introduces them. Columns listed here are the contract;
specs add detail (constraints, indexes).

```mermaid
erDiagram
  physios ||--o{ customers : owns
  physios ||--o{ exercise_categories : owns
  physios ||--o{ exercises : owns
  exercise_categories ||--o{ exercise_categories : "parent (max depth 2)"
  exercise_categories ||--o{ exercises : groups
  exercises ||--o{ exercise_media : has
  customers ||--o{ cases : has
  customers ||--o{ routines : has
  customers ||--o{ weekly_plans : has
  cases |o--o{ routines : "optional link"
  cases |o--o{ weekly_plans : "optional link"
  routines ||--o{ routine_groups : "supersets"
  routines ||--o{ routine_items : contains
  routine_groups |o--o{ routine_items : "groups 2-3"
  routine_items ||--o{ routine_item_sets : "one row per set"
  exercises ||--o{ routine_items : "used in"
  weekly_plans ||--o{ weekly_plan_entries : "day slots"
  routines ||--o{ weekly_plan_entries : "attached to"
  routines ||--o{ routine_versions : snapshots
  weekly_plans ||--o{ weekly_plan_versions : snapshots
  customers ||--o{ share_links : "shared via"
  share_links ||--o{ session_logs : "logged through"
  routines ||--o{ session_logs : "logged for"
  customers ||--o{ visit_notes : has
```

| Table                                      | Spec                           | Purpose                                                                |
| ------------------------------------------ | ------------------------------ | ---------------------------------------------------------------------- |
| `physios`                                  | 01 (+09 branding columns)      | Profile, 1:1 with `auth.users` (`id` = auth user id). `handle` unique. |
| `exercise_categories`                      | 03                             | Two-level tree (`parent_id` null = top level).                         |
| `exercises`, `exercise_media`              | 03                             | Library entries (no prescription of their own) and ordered media.      |
| `customers`                                | 04                             | Patient contact/basic info, `locale`.                                  |
| `cases`                                    | 04                             | Injury episodes per customer (body area/side from spec 02).            |
| `routines`, `routine_groups`               | 05 (+07 templates, +08 phases) | Routine header; a group is one superset (shared rest). Template ⇔ null |
| `routine_items`, `routine_item_sets`       | 05                             | Ordered exercises (per-item prescription) and one row per set.         |
| `weekly_plans`, `weekly_plan_entries`      | 06 (+07, +08)                  | Mon–Sun; entries reference routines by id.                             |
| `share_links`                              | 10                             | Link code, target, PIN hash, expiry, revocation.                       |
| `session_logs`                             | 13                             | Patient-submitted completion/pain/comment per routine per date.        |
| `routine_versions`, `weekly_plan_versions` | 15                             | JSON snapshots on each save.                                           |
| `visit_notes`                              | 16                             | Private per-visit clinical notes (SOAP).                               |

### Shared column conventions

- Primary keys: `uuid` default `gen_random_uuid()`.
- `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`
  via the `timestamps` helper in `src/db/schema/_columns.ts`. `updated_at` is maintained by the
  shared `set_updated_at()` trigger function (spec 01): every table with `updated_at` attaches it
  (`before update ... for each row`) in the spec's custom migration. An integration test fails
  when a table is missing it, or when a `public` table lacks RLS.
- Soft delete via `archived_at timestamptz` where the spec says so. Hard delete otherwise.
- Calendar dates (injury date, phase start, log date) are `date`, not `timestamptz`.
- Weekdays are ISO numbers: 1 = Monday … 7 = Sunday.
- Ordered children use `position integer not null`; reorders rewrite positions in one transaction.
- Enums are Postgres enums defined in Drizzle (`pgEnum`) and mirrored as TS unions.
- Drizzle `casing: "snake_case"`: write camelCase in TS, get snake_case in SQL.
- Migrations reach production from CI on every push to `main` (the `migrate` job), while Vercel
  deploys the same commit in parallel, so either can land first. Keep every migration
  backwards-compatible with the previous app version (expand, then contract): add nullable
  columns/new tables first, and drop or rename in a later PR once no deployed code uses them.

### Prescription model (spec 05)

The prescription lives only on routines; exercises carry no defaults (the old default columns on
`exercises` are unused and dropped in a follow-up chore). It has two levels:

- **Per set**, one `routine_item_sets` row each (`position` 0-based, at most 20 per item):
  `reps smallint`, `reps_max smallint` (range when set: "8–12"; needs `reps` and must exceed
  it), `duration_seconds integer` (timed sets), `load text` ("5 kg", "red band"). Sets may differ
  (12 / 10 / 8).
- **Per item**, on `routine_items`: `hold_seconds smallint`, `rest_seconds smallint`, `side` enum
  (`left | right | both | alternating`), `notes text`.
- **Supersets**: `routine_groups` (rest after each round, `rest_seconds`). Items point to it with
  `group_id`; 2 or 3 consecutive members alternate set by set, all with the same number of sets,
  and a grouped item has no `rest_seconds` of its own.

Everything is nullable and the UI shows only what is set. The zod shapes (`setShape`,
`itemShape`) and the Drizzle helpers (`_prescription.ts`) are shared, and every consumer renders
the one-line summary with `formatPrescription` (`src/lib/prescription.ts`).

## Conventions

- **Server Components by default**; add `"use client"` only for interactivity. Never pass
  functions (including icon components) from Server to Client Components; pass serialisable
  props.
- **Mutations** are Server Actions in `src/server/<domain>/actions.ts`: parse input with the zod
  schema, run the change from `mutations.ts` inside `withPhysio`, `revalidatePath`/`revalidateTag`,
  return a typed result (`{ ok: true, data } | { ok: false, error }`). No business logic in
  components or actions.
- **Forms**: native `<form action>` + `useActionState`; the same zod schema validates client
  hints and the server.
- **Strings**: every user-visible string goes in **every** `messages/<locale>.json` under a
  namespace per feature, in the same change (`src/i18n/messages.test.ts` enforces same keys,
  ICU arguments and tags). No hard-coded copy in components. Dates, numbers and lists use
  next-intl formatters or `Intl` with the active locale.
- **Accessibility**: labelled inputs, keyboard-reachable controls, visible focus, respects
  reduced motion (workout timers and animations).
- **Styling**: use design tokens (`bg-background`, `text-muted-foreground`, `bg-primary`…). Never
  hard-code colours; accent colour must stay on `primary` so branding (spec 09) can override it.
- **Handles and top-level routes**: adding a top-level route requires adding it to
  `RESERVED_HANDLES` in `src/lib/handles.ts` (a unit test enforces this).

## Testing strategy

| Layer       | Tool                                                                    | What                                                                                                                                                                                                     |
| ----------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | Vitest (`src/**/*.test.ts(x)`)                                          | Pure helpers in `src/lib`, zod schemas, components with Testing Library.                                                                                                                                 |
| Integration | Vitest (`src/**/*.int.test.ts`, `pnpm test:int`, needs `pnpm db:start`) | Queries/mutations against local Supabase via `runAsPhysio`, **including RLS tests** proving physio A cannot read or write physio B's rows. Set up in spec 01, required for every spec that adds a table. |
| E2E         | Playwright (`e2e/`), desktop + mobile                                   | Critical flows per spec. Auth helper that signs in a seeded test physio is added in spec 01.                                                                                                             |

`pnpm check` runs lint, typecheck, format check and unit tests (no database); CI runs it plus
integration and e2e jobs against a local Supabase started with the Supabase CLI.

## How features get built

Each feature is implemented in its own session and branch from its spec, following the
Superpowers workflow (`brainstorming` is already done: the spec is its output):

1. Read `CLAUDE.md`, this file and the spec (plus the specs it depends on).
2. Resolve the spec's **Open questions** with the user before planning.
3. `writing-plans`: turn the spec into a step-by-step plan (`docs/plans/NN-<name>.md`).
4. `test-driven-development` / `subagent-driven-development` to execute the plan.
5. `verification-before-completion`: `pnpm check`, integration and e2e tests green.
6. Update the spec's **Status** and the index in `docs/specs/README.md`.
7. `requesting-code-review`, then `finishing-a-development-branch` to merge or open a PR.

The plugin is enabled for the project in `.claude/settings.json`. Specs and plans live in
`docs/specs/` and `docs/plans/`, not the skills' default `docs/superpowers/` folders.
