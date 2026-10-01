# 10 · Sharing and patient page

- **Status:** Done
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
2. PIN: 4 digits; on success set an httpOnly, secure, `SameSite=Lax` cookie containing an HMAC of
   (`code`, `pin_hash`) so regenerating the PIN invalidates it. **No rate limiting** (decided,
   see Open questions): the PIN is a light lock only.
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
- Codes: 40 bits of entropy are the real protection. There is no rate limiting (decided), so a
  4-digit PIN can be brute-forced by anyone who holds the link.
- Integration tests: a link for customer A can't be used to fetch customer B's routine even
  when B's routine id is passed in a crafted request (for any action that takes ids).

## i18n

Namespace `Patient` (all copy on the patient page), `Sharing` (physio popover).

## Acceptance criteria

- [x] Physio can create, copy, share (WhatsApp/email), revoke, regenerate, set expiry and PIN.
- [x] Canonical redirects work after handle/slug changes; unknown codes 404.
- [x] Patient page shows today's plan entries and active single routines, with media and prescription, in the customer's locale and physio branding.
- [x] PIN gate (no rate limit, by decision); revoked/expired pages; noindex + no-store headers.
- [x] Per-link web manifest; installable on Android/iOS.
- [x] Lighthouse mobile performance ≥ 90 on a routine with 8 exercises (lazy media). See decisions.
- [x] Integration tests for resolution rules and cross-customer isolation.

## Test plan

- Unit: code generation alphabet/length, slug param parsing, URL building, PIN cookie HMAC.
- Integration: resolve-link (valid/revoked/expired/archived/PIN), isolation, open-count throttle.
- E2E (mobile project): open customer link → today's routine visible → switch day; PIN flow;
  revoked link page.

## Open questions

1. Default for new links: PIN off (friction-free) or on?
   **Answer (2026-10-01):** off. The physio turns it on per link.
2. Should patients see the week strip for single routines too ("3× per week"), or only for plans?
   **Answer:** only for plans. Single routines show their existing `sessions_per_week` /
   `sessions_per_day` as a text label ("3× per week"), no strip.
3. (Raised while designing) Where does the PIN rate limit live: Postgres, Upstash?
   **Answer:** neither: **no rate limiting** in this spec. Consequence: a 4-digit PIN can be
   brute-forced by anyone holding the link, so it is only a light lock; the 40-bit code is the
   real protection. The rate-limit rule, the 404 limiter and its acceptance criterion are
   dropped.
4. (Raised while designing) New dependency for the QR code?
   **Answer:** yes, `qrcode`.

## Decisions made during implementation

- **No rate limiting** (answer to a question raised in design): no limiter table, no Upstash, no
  limit on unknown codes either. Besides guessing, each PIN attempt costs one scrypt run, so a
  flood of attempts also costs CPU; revisit with the limiter if that ever matters. The consequence is written into the popover's PIN hint ("a light
  lock, not strong security").
- **Link per target.** Besides the specced one live customer link, a routine and a plan each have
  at most one live link (partial unique indexes), so "Share this routine" always shows the same
  link. Composite FKs keep a link inside its physio; `routine_id` / `weekly_plan_id` are set only
  for their target (check constraint) and the customer is always derived from the routine or plan.
- **Created on first open, never silently re-created.** Opening the popover creates the link only
  when the target never had one. After a revoke it shows the revoked state with "Create new link",
  so the physio's revoke is not undone by reopening. Archived customers get no Share button (their
  links are revoked by `onCustomerArchived`; restoring does not re-enable them).
- **Regenerate** revokes the live link and creates a new code but keeps the slug, the PIN and an
  expiry that is still ahead (an expired link's date would make the new link dead on arrival, so
  it is dropped). The PIN cookie is bound to the code, so everyone has to re-enter it.
- **PIN** is always generated (4 random digits, unbiased), stored as a scrypt hash from
  `node:crypto` (no new dependency) and shown once; turning it on again issues a new one.
  The unlock cookie is `pin_<code>`, HMAC of (code, pin_hash) keyed with `SUPABASE_SECRET_KEY`,
  `httpOnly`, `SameSite=Lax`, `Secure` in production, lifetime 30 days (shorter if the link
  expires sooner). **Deviation:** its path is `/`, not the link path, so it keeps working after a
  slug rename redirects. The cookie name carries the code, so it is useless for any other link.
  On iOS an installed home-screen app has its own cookie jar, so the PIN is asked once more there.
- **Expiry** is chosen as a calendar day: the link works through the end of that day in the
  physio's time zone (`endOfDay` / `lastDayBefore` in `src/lib/calendar-date.ts`). Saved with a
  button (a date input passes through other valid dates while a year is typed).
- **Slug** is edited as free text, normalised with `slugify` (≤ 40 chars). Defaults: first name,
  routine name or plan name, `link` when nothing usable remains.
- **"Preview as patient"** lives in the popover (an "open" button next to Copy), not on the
  customer page. The signed-in physio bypasses the PIN and does not count as an open.
- **Week strip** is for plans only and is driven by `?day=1..7` (server-rendered, works without
  JS, the canonical redirect keeps it). Single routines show their existing `sessions_per_week` /
  `sessions_per_day` as text ("3× per week"). One strip is shared by all active plans.
- **Drafts never reach the patient.** A routine inside an active plan is shown only when its own
  status is `active` (routines created from the plan board start as drafts), the same rule as
  when it is shared on its own; a day that only has a draft routine gets no dot in the strip.
- **Opens by link-preview bots are not counted** (`isLinkPreviewBot`: WhatsApp, iMessage,
  Slack, search crawlers…), nor are opens by the signed-in owner, so "Opened 1 time" means a
  person looked.
- **What an item link shows.** Routine and plan links apply the same "active today" rule as the
  customer link (spec 08), so a draft, ended or not-yet-started item shows the empty state with
  the next start date. A routine that lives only inside a plan can still be shared on its own; its
  own window is ignored there (spec 08).
- **Patient data layer.** `src/server/patient/` only: `resolveLink` (code → link, customer first
  name and locale, physio handle, time zone and branding), `hasLinkAccess` (no PIN, owner session or
  valid token), `getPatientView` (every id from the link; plan entries' routines must belong to the
  link's customer and not be archived), `touchLink` (one conditional UPDATE, 30 min). The PIN hash
  never leaves the server.
- **Customer's language.** The root layout only knows the physio's cookie, so the patient layout
  nests a `NextIntlClientProvider` with the customer's locale and only the namespaces its client
  components use (`Patient`, `Library.media`); server components call `getTranslations({ locale })`.
  `lang` is set on the page wrapper (the `<html>` element stays the root layout's).
- **Headers.** `src/proxy.ts` adds `Cache-Control: private, no-store`, `Referrer-Policy:
no-referrer` and `X-Robots-Tag: noindex, nofollow` to paths matching `/{handle}/{slug}-{code}`
  (`isPatientPath`, which relies on `RESERVED_HANDLES` to tell app routes apart); the page also
  emits `<meta name="robots">` / `<meta name="referrer">`. In `next dev` Next replaces the cache
  header; the production build (e2e) keeps `no-store`.
- **Manifest.** `/{handle}/{slug}-{code}/manifest.webmanifest` (route handler, 404 for unusable
  links) has the clinic name, the link as `start_url`/`id`, `/{handle}/` as the scope (so a slug
  rename, which redirects the installed app's start URL, stays in scope; a handle rename does
  not), the accent as `theme_color`
  and the app's icons (a clinic logo has no guaranteed size or shape). `metadata.manifest` in the
  patient layout replaces the physio app's.
- **Media.** Exercise media is YouTube links only in v1, so there are no signed URLs to make;
  videos are the existing click-to-load `YouTubePreview` (thumbnail lazy, iframe on tap).
- **QR code.** `qrcode` (new dependency) in `src/lib/qr.ts` gives a path of horizontal runs; the
  popover draws it as a plain `<path>`, always black on white with a quiet zone.
- **Lighthouse.** Not enforced in CI. Run by hand (`lighthouse@12`, mobile, production build) on a
  routine with 8 exercises and a video each: performance 0.99 (FCP 0.9 s, LCP 2.0 s, TBT 50 ms,
  CLS 0). The sandbox has no internet, so the YouTube thumbnails did not load; they are
  `loading="lazy"` images, so the score should hold.
- **Verification environment.** No Docker daemon here, so integration and e2e ran against a local
  Postgres 16 with stubbed `auth`/`storage` schemas and a small fake GoTrue (create/delete user,
  magic link, verify, user). The branding suites and the Data API test need real Supabase and were
  not runnable; CI runs them.
