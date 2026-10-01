# Sharing and Patient Page Implementation Plan

**Goal:** A physio creates, copies, shares, protects (PIN, expiry), revokes and regenerates
no-account links to a customer (everything active today), a single routine or a weekly plan.
Patients open `/{handle}/{slug}-{code}` and see a mobile-first, branded, localised page with
today's plan entries, active routines, exercise media and prescriptions, installable per link.

**Architecture:** `share_links` table (composite FKs, RLS, one live link per target) in a
generated migration plus a custom one (code/slug checks, partial unique indexes, trigger). Pure
helpers in `src/lib/share-links.ts` (code, slug param, URLs, share hrefs), `src/lib/qr.ts` (QR
path from `qrcode` modules) and `src/lib/pin.ts`. Physio side in `src/server/sharing/`
(`withPhysio`, RLS) feeding a Share popover. Patient side only in `src/server/patient/` (owner
`db`): `resolveLink(code)`, PIN hash and cookie, `getPatientView`, a throttled `touchLink`.
Patient routes under `src/app/(patient)/[handle]/[slug]/` (layout resolves the link once through
`React.cache`, nests an explicit-locale `NextIntlClientProvider`, branding and metadata; page;
PIN form; per-link manifest route handler). The proxy adds privacy headers to patient paths.

**Spec:** `docs/specs/10-sharing-and-patient-page.md` (answers recorded there). Patterns to copy:
`docs/plans/06-weekly-plans.md`, `src/server/plans/*`, `src/server/customers/hooks.ts`.

## Global Constraints

Same as `docs/plans/06-weekly-plans.md` (RLS + `set_updated_at`, composite FKs, `physio_id`
filters inside `withPhysio`, every string in every `messages/*.json`, shadcn primitives, design
tokens only, no functions across the server/client boundary, expand-only migrations, commit per
task with `pnpm check` green) plus:

- Patient-facing queries live only in `src/server/patient/`, derive every id from the resolved
  link and select only the fields the page shows.
- "Active today" is `scheduleFilter` / `physioToday` (spec 08); never a private date comparison.
- Patient UI is async server components using `getTranslations({ locale })` or client components
  inside the nested provider; sync server components with `useTranslations` would use the
  physio's cookie locale, not the customer's.
- Clarifying round: PIN off by default; strip for plans only (routines show "N× per week" as
  text); **no rate limiting** (the PIN is a light lock only); add `qrcode`.

## Tasks

1. **Pure helpers** (+ tests): `src/lib/share-links.ts` (`generateCode`, `parseSlugParam`,
   `shareSlug`, `buildSharePath`, `buildShareUrl`, `whatsappShareHref`, `mailtoShareHref`),
   `src/lib/pin.ts` (`generatePin`, `isValidPin`), `endOfDayIn` in `calendar-date.ts`,
   `src/lib/qr.ts`.
2. **Schema + migrations**: `share_links`, enum `share_target`; custom migration for code/slug
   checks, target/ids check, partial unique indexes, trigger.
3. **Physio server layer** (`src/server/sharing/`): schemas, queries, mutations (get-or-create,
   update slug/expiry, set/clear PIN, revoke, regenerate), thin actions, archive hook. Integration
   tests incl. RLS and cross-physio/cross-customer rejection.
4. **Patient server layer** (`src/server/patient/`): `pin.ts` (scrypt + cookie token),
   `resolve-link.ts`, `view.ts`, `touch.ts`, `actions.ts` (`verifyPinAction`). Integration tests:
   resolution states, isolation, today's content, throttle.
5. **Proxy headers** (`src/lib/patient-paths.ts`, `src/proxy.ts`).
6. **Share popover** + buttons (customer header, routine editor, plan board), QR, copy,
   WhatsApp, email, PIN, expiry, revoke/regenerate, preview.
7. **Patient routes and UI**: layout, page, unavailable/empty/PIN states, plan day strip, routine
   view, exercise cards, per-link manifest.
8. **i18n** (`Patient`, `Sharing`) in `en` and `es`.
9. **E2E** (`e2e/sharing.spec.ts`, desktop + mobile).
10. **Docs**: spec Status, decisions, README index; verification and self-review.
