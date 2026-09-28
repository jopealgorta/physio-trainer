# Physio Trainer

Rehab routines your patients actually open. Physiotherapists manage customers and injury
cases, build routines and weekly plans from their own exercise library (videos, categories,
body areas), and share them through a clean link, with no patient account needed. Patients can
follow a guided workout, log sessions and pain, and download a branded PDF.

> **Status:** sign-in, onboarding and profile (spec 01) are built. Features are specified in
> [`docs/specs/`](docs/specs/README.md) and built one per session.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui · Supabase (Postgres, Auth,
Storage) · Drizzle ORM · next-intl · Vitest · Playwright. See
[`docs/architecture.md`](docs/architecture.md).

## Getting started

Requirements: Node 24 (see .nvmrc), pnpm 10, Docker (for local Supabase).

```bash
pnpm install
pnpm db:start            # local Supabase in Docker
cp .env.example .env.local
# Copy PUBLISHABLE_KEY and SECRET_KEY from `pnpm exec supabase status -o env` into
# NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY in .env.local
pnpm dev                 # http://localhost:3000, sign-in emails land in Mailpit (http://127.0.0.1:54324)
```

## Scripts

| Script                                   | What it does                                                      |
| ---------------------------------------- | ----------------------------------------------------------------- |
| `pnpm dev` / `build` / `start`           | Next.js                                                           |
| `pnpm check`                             | Lint, typecheck, Prettier check, unit tests                       |
| `pnpm test` / `test:watch`               | Vitest                                                            |
| `pnpm test:int`                          | Integration tests against local Supabase (RLS, triggers, queries) |
| `pnpm test:e2e`                          | Playwright (desktop + mobile), builds and serves on port 3100     |
| `pnpm db:start` / `db:stop` / `db:reset` | Local Supabase                                                    |
| `pnpm db:generate`                       | Generate a migration from the Drizzle schema                      |
| `pnpm db:studio`                         | Drizzle Studio                                                    |

## Hosted Supabase setup

Local config lives in `supabase/config.toml`; a hosted project needs the same settings in the
dashboard:

1. **Migrations**: apply them to the hosted project with
   `pnpm exec supabase link --project-ref <ref>`, then `pnpm exec supabase db push`. This also
   creates the `auth.users` trigger that gives every new user a `physios` row.
2. **Data API**: disable it (Project Settings → Data API). The app only talks to Postgres
   through Drizzle on the server.
3. **Auth → URL configuration**: Site URL = the app URL; add `<app URL>/auth/**` to the
   redirect URLs. A missing redirect URL breaks magic links (they fall back to the Site URL).
4. **Auth → Email templates**: paste `supabase/templates/magic_link.html` into both "Magic
   Link" and "Confirm signup".
5. **Auth → SMTP**: configure a real SMTP provider before launch; the built-in sender is
   rate-limited.
6. **Google** (optional): enable the provider with the Google Cloud client id/secret, then set
   `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true` in the app's environment.

## Project docs

- [`docs/architecture.md`](docs/architecture.md): decisions, domain model, security model, conventions
- [`docs/specs/`](docs/specs/README.md): feature specs and build order
- [`CLAUDE.md`](CLAUDE.md): working agreements for AI-assisted development
