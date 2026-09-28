@AGENTS.md

# Physio Trainer

Web app for physiotherapists to manage customers, build rehab/gym routines and weekly plans
from a personal exercise library, and share them with patients through clean links that need
no account.

**Read before any feature work:** `docs/architecture.md` (domain model, tenancy/security
rules, conventions) and the relevant spec in `docs/specs/` (index and build order in
`docs/specs/README.md`).

## Commands

```bash
pnpm dev             # dev server (http://localhost:3000)
pnpm check           # lint + typecheck + format:check + unit tests: run before every commit
pnpm test            # unit tests (Vitest)
pnpm test:int        # integration tests against local Supabase (needs pnpm db:start)
pnpm test:e2e        # Playwright (builds and starts the app on :3100)
pnpm db:start        # local Supabase (Docker); prints URLs and keys for .env.local
pnpm db:generate     # generate a SQL migration from src/db/schema into supabase/migrations
pnpm db:reset        # recreate local DB and apply all migrations
```

In sandboxes where Playwright's bundled browser is missing, set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` (the SessionStart hook does this on
Claude Code on the web).

## Workflow (Superpowers)

The Superpowers plugin is enabled in `.claude/settings.json`; use its skills at each step. The
user's loop is **task → clarifying questions → one design approval → review the PR**.
Everything between the design approval and the open PR runs without stopping.

1. **Intake.** One task per session/branch: a spec (`NN`) or an ad-hoc change. Pull `main`,
   branch as `feat/NN-<name>`, `fix/<name>` or `chore/<name>`, read `docs/architecture.md`
   and the spec plus the specs it depends on.
2. **Clarify.** Ask the spec's "Open questions" and anything else ambiguous, one batch at a
   time. Record the answers in the spec (spec work) or the PR description (ad-hoc work).
3. **Design checkpoint (the only gate).** Post a short design in chat: approach, files
   touched, test plan, risks. Wait for an explicit yes. A new feature with no spec gets one
   written from `docs/specs/_template.md` as the first commit after approval, not a dated
   design doc.
4. **Build autonomously.** Spec work: `superpowers:writing-plans` → `docs/plans/NN-<name>.md`
   (no plan review), then `superpowers:subagent-driven-development`. Ad-hoc work: no plan
   doc. Always test-first (`superpowers:test-driven-development`); bugs and failing tests go
   through `superpowers:systematic-debugging`. Stop only for a decision that is genuinely the
   user's, or when the work turns out bigger than the approved design (say so, re-design).
5. **Verify and self-review.** `superpowers:verification-before-completion`: `pnpm check`,
   `pnpm test:int`, e2e for the feature. Then `superpowers:requesting-code-review` and fix
   what it finds. Update the spec's Status and "Decisions made during implementation", and
   the index table in `docs/specs/README.md`.
6. **Open the PR.** Push and open a PR against `main`: summary, answers to the clarifying
   questions, decisions/deviations, verification evidence. Enable the desktop app's CI
   monitor on it; CI failures and review comments that arrive through it get fixed, pushed
   and replied to on their threads without asking.
7. **Merge on approval.** When the user approves the PR or says "merge": squash-merge,
   delete the branch, pull `main`. Never merge without that.

These override the Superpowers defaults: no `docs/superpowers/...` paths (specs live in
`docs/specs/`, plans in `docs/plans/`); no written-spec review or plan review gate; no
execution-method question (subagent-driven); `superpowers:finishing-a-development-branch`
always takes the "push and open a PR" option instead of offering the menu.

## Rules that are easy to get wrong

- **Next.js 16**: `middleware` is now `src/proxy.ts`; `params`/`searchParams`/`cookies()` are
  async; check `node_modules/next/dist/docs/` before using an API.
- **Tenancy**: every physio-owned table has `physio_id` + RLS; physio-facing queries go through
  `withPhysio()` (spec 01) and also filter by `physio_id`. Patient-facing code lives only in
  `src/server/patient/` and derives every id from the resolved share link.
- `src/db` and `src/lib/supabase/server.ts` are server-only. Read env through `@/env`.
- Don't pass functions (e.g. lucide icons) from Server to Client Components.
- **i18n**: every user-visible string goes in **every** `messages/*.json` (`en`, `es`) in the
  same change; no hard-coded copy. Spanish is Rioplatense voseo ("ingresá", "elegí"). Format
  dates/numbers with next-intl (`getFormatter`/`useFormatter`) or `Intl` with the active locale,
  never a hard-coded `en-US`. `src/i18n/messages.test.ts` fails `pnpm check` on missing keys or
  mismatched ICU arguments/tags.
- Accent colour must use the `primary` token (physio branding overrides it).
- New top-level route ⇒ add it to `RESERVED_HANDLES` in `src/lib/handles.ts` (a test enforces it).
- Migrations are generated by drizzle-kit from `src/db/schema/`; don't hand-edit generated SQL
  except to add things drizzle can't express (triggers, storage policies), in a separate migration.
- shadcn/ui primitives live in `src/components/ui`; add more with `pnpm dlx shadcn@latest add <name>`
  (if the registry is unreachable, write the component source by hand in the same style).
