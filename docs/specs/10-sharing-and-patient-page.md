# 10 · Sharing and patient page

- **Status:** Not started
- **Feature:** Core (+ link security decisions)
- **Depends on:** 05, 06, 08, 09

## Summary

Patients open their routines through a clean link without an account. Each customer gets one
**customer link** that always shows what is active today (single routines + weekly plans);
physios can also share a **single routine or plan** on its own. Links can be revoked,
regenerated, set to expire, and protected with a 4-digit PIN. The patient page is
mobile-first, branded, in the customer's language, and installable to the home screen.

## Goals

- Share links: create, copy, share via WhatsApp/email buttons, revoke, regenerate, expiry, PIN.
- Public route `/{handle}/{slug}-{code}` with canonical redirects.
- Patient page: today's plan day, single routines, exercise details with media, notes.
- PWA manifest per link so "Add to home screen" opens the right page.

## Non-goals

- Guided workout mode (spec 12), logging (spec 13), PDF download (spec 14), OG images (spec 11).
- Patient accounts, messaging.

## Link format

`https://{app}/{handle}/{slug}-{code}`, e.g. `/maria-lopez/ana-7k2m9qpx`.

- `code`: 8 chars from Crockford base32 alphabet (`0-9a-z` minus `i l o u`), generated with
  `crypto.getRandomValues`; unique; the **only** lookup key.
- `slug`: cosmetic. Customer link default = `slugify(first_name)`; routine/plan link default =
  `slugify(name)`. Physio can edit it (e.g. to remove the name). ≤ 40 chars.
- Resolution: parse `code` = text after the last `-` of the second segment (8 chars). If the
  handle or slug differ from current values, `308` redirect to the canonical URL (so handle or
  slug renames never break links).
- Helpers in `src/lib/share-links.ts`: `generateCode`, `parseSlugParam`, `buildShareUrl`
  (uses `NEXT_PUBLIC_APP_URL`). Unit-tested.

## Data model

`share_links`:

| Column                        | Type                                      | Notes                                 |
| ----------------------------- | ----------------------------------------- | ------------------------------------- |
| `id`, `physio_id`, timestamps |                                           |                                       |
| `customer_id`                 | uuid not null → customers (cascade)       |                                       |
| `target`                      | enum `customer \| routine \| weekly_plan` |                                       |
| `routine_id`                  | uuid null → routines (cascade)            | set iff target = routine              |
| `weekly_plan_id`              | uuid null → weekly_plans (cascade)        | set iff target = weekly_plan          |
| `slug`                        | text not null                             |                                       |
| `code`                        | text unique not null                      |                                       |
| `pin_hash`                    | text null                                 | scrypt/argon2 hash of the 4-digit PIN |
| `expires_at`                  | timestamptz null                          |                                       |
| `revoked_at`                  | timestamptz null                          |                                       |
| `last_opened_at`              | timestamptz null                          |                                       |
| `open_count`                  | integer not null default 0                |                                       |

Partial unique index: one non-revoked `customer` link per customer.

## Routes and UI

Physio side:

| Where                       | What                                                                                                                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer header             | "Share" button → popover: customer link (copy, WhatsApp, email, QR), status, PIN toggle (shows the PIN once, with "regenerate"), expiry date, revoke/regenerate. Created on first open. |
| Routine editor / plan board | "Share this routine/plan" → same popover for an item link.                                                                                                                              |
| Customer page               | "Preview as patient" opens the patient page in a new tab (physio session bypasses PIN).                                                                                                 |

Patient side (`src/app/(patient)/[handle]/[slug]/`):

| Route                           | Purpose                                                                                                                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page.tsx`                      | Patient page.                                                                                                                                                                       |
| `pin/` (or inline state)        | PIN entry screen when required.                                                                                                                                                     |
| `manifest.webmanifest/route.ts` | Per-link manifest (name = clinic name, start_url = link, theme colour = accent). Set `metadata.manifest` in the patient layout so it replaces the physio app manifest from spec 18. |

Patient page layout (mobile-first, branded via spec 09):

1. Header: physio logo + clinic name; greeting "Hi Ana".
2. **Today**: for each active weekly plan, today's entries (with labels), then a 7-day strip to
   look at other days. For customer links, also active single routines ("Your routines").
3. Routine view: notes, then exercise cards: media (video loops muted, tap for sound/fullscreen;
   YouTube/Vimeo embeds lazy-loaded), name, prescription summary (`formatPrescription`),
   instructions (collapsible), item notes. Note (spec 05): the prescription is per set (plus
   hold, rest, side and notes per item), and a superset shows as one block; render it with
   `formatPrescription`, never from raw columns.
4. Footer: physio contact buttons (call, WhatsApp, email) if allowed; "Add to home screen" hint.
5. States: expired/revoked → friendly page with physio contact; nothing active → "Your physio
   hasn't scheduled anything for today" + next upcoming item if spec 08 decided to show it.

## Behaviour and rules

1. Server-side resolution in `src/server/patient/resolve-link.ts`: find by code; 404 if
   missing; "unavailable" page if revoked/expired or customer archived; PIN gate if `pin_hash`.
2. PIN: 4 digits; on success set an httpOnly, secure, `SameSite=Lax` cookie scoped to the link
   path containing an HMAC of (`code`, `pin_hash`) so regenerating the PIN invalidates it.
   Rate-limit attempts: 5 per 15 min per link+IP (Postgres table or Upstash; decide in plan),
   then a cool-down message.
3. Locale for the page = customer's `locale` (pass it to next-intl explicitly).
4. "Today" uses the physio's timezone for v1 (spec 08 helper).
5. Media URLs are signed (≥ 1 h validity) at render time; the page is `dynamic` and sends
   `Cache-Control: private, no-store`.
6. `open_count`/`last_opened_at` updated at most once per 30 min per link (avoid write
   amplification).
7. Archiving a customer revokes all their links (implements the hook from spec 04).
8. Regenerating a link revokes the old one and creates a new code; old URLs show the
   "unavailable" page.
9. `<meta name="robots" content="noindex, nofollow">` and `Referrer-Policy: no-referrer` on
   patient pages.

## Security and privacy

- Follows architecture rule 3 strictly: all patient queries in `src/server/patient/`, owner
  connection, every id derived from the resolved link, minimal field selection.
- Exposed to patients: customer first name, routine/plan names/notes, exercises (name,
  instructions, media), prescription, physio branding/contact. **Not exposed**: case details,
  medical history, visit notes, other customers, last names, contact info of the customer.
- Codes: 40 bits of entropy + rate limiting on 404s per IP (reuse the limiter).
- Integration tests: a link for customer A can't be used to fetch customer B's routine even
  when B's routine id is passed in a crafted request (for any action that takes ids).

## i18n

Namespace `Patient` (all copy on the patient page), `Sharing` (physio popover).

## Acceptance criteria

- [ ] Physio can create, copy, share (WhatsApp/email), revoke, regenerate, set expiry and PIN.
- [ ] Canonical redirects work after handle/slug changes; unknown codes 404.
- [ ] Patient page shows today's plan entries and active single routines, with media and prescription, in the customer's locale and physio branding.
- [ ] PIN gate + rate limit; revoked/expired pages; noindex + no-store headers.
- [ ] Per-link web manifest; installable on Android/iOS.
- [ ] Lighthouse mobile performance ≥ 90 on a routine with 8 exercises (lazy media).
- [ ] Integration tests for resolution rules and cross-customer isolation.

## Test plan

- Unit: code generation alphabet/length, slug param parsing, URL building, PIN cookie HMAC.
- Integration: resolve-link (valid/revoked/expired/archived/PIN), isolation, rate limit.
- E2E (mobile project): open customer link → today's routine visible → switch day; PIN flow;
  revoked link page.

## Open questions

1. Default for new links: PIN off (friction-free) or on?
2. Should patients see the week strip for single routines too ("3× per week"), or only for plans?

## Decisions made during implementation

(Fill in while building.)
