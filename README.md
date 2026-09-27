# Physio Trainer

Rehab routines your patients actually open. Physiotherapists manage customers and injury
cases, build routines and weekly plans from their own exercise library (videos, categories,
body areas), and share them through a clean link, with no patient account needed. Patients can
follow a guided workout, log sessions and pain, and download a branded PDF.

> **Status:** project scaffold. Features are specified in [`docs/specs/`](docs/specs/README.md)
> and built one per session.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui · Supabase (Postgres, Auth,
Storage) · Drizzle ORM · next-intl · Vitest · Playwright. See
[`docs/architecture.md`](docs/architecture.md).

## Getting started

Requirements: Node 22+, pnpm 10, Docker (for local Supabase).

```bash
pnpm install
cp .env.example .env.local
pnpm db:start            # copy the printed publishable/secret keys into .env.local
pnpm dev                 # http://localhost:3000
```

## Scripts

| Script                                   | What it does                                                  |
| ---------------------------------------- | ------------------------------------------------------------- |
| `pnpm dev` / `build` / `start`           | Next.js                                                       |
| `pnpm check`                             | Lint, typecheck, Prettier check, unit tests                   |
| `pnpm test` / `test:watch`               | Vitest                                                        |
| `pnpm test:e2e`                          | Playwright (desktop + mobile), builds and serves on port 3100 |
| `pnpm db:start` / `db:stop` / `db:reset` | Local Supabase                                                |
| `pnpm db:generate`                       | Generate a migration from the Drizzle schema                  |
| `pnpm db:studio`                         | Drizzle Studio                                                |

## Project docs

- [`docs/architecture.md`](docs/architecture.md): decisions, domain model, security model, conventions
- [`docs/specs/`](docs/specs/README.md): feature specs and build order
- [`CLAUDE.md`](CLAUDE.md): working agreements for AI-assisted development
