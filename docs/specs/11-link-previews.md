# 11 · Link previews

- **Status:** Done
- **Feature:** E (rich link previews)
- **Depends on:** 09, 10

## Summary

When a physio pastes a patient link into WhatsApp, iMessage, email or Slack, it unfurls into a
clean card with the physio's logo, clinic name and accent colour, instead of a bare URL. A link to
a routine or weekly plan also carries that item's title, so the patient sees what it is. Previews
never contain customer data or exercise content.

## Goals

- Open Graph and Twitter card metadata for patient links.
- Generated OG image (1200×630) per physio branding, with the routine's or plan's title as the
  headline and the clinic name under it.
- A physio-facing preview of how the card will look (in the share popover).

## Non-goals

- Per-customer imagery or text (privacy: previews are visible to anyone the link is forwarded to
  and are cached by the messaging apps). The one per-item exception is the routine or plan title
  (see Decisions).

## Behaviour

1. `generateMetadata` on the patient route returns:
   - `title`: the routine's or plan's name for a routine or plan link, else "Your exercise plan"
     (localised to the customer's locale). The clinic is not in the text: it is on the image and
     in `og:site_name`.
   - `description`: "Open your routine." / "Open your weekly plan." / "Open your exercises."
     (customer link). No names of exercises, injuries, or the patient.
   - `openGraph.images`: the image route, versioned (`…/og?v=…`).
   - `robots: { index: false }`.
2. `src/app/(patient)/[handle]/[slug]/og/route.tsx` (a route handler, not the `opengraph-image`
   file convention, see Decisions; Next 16: `params` is a Promise): renders logo (from the public `branding` bucket),
   the title (routine and plan links) with the clinic name on a second line, and a subtle
   accent-colour background using `ImageResponse`.
3. Metadata and image are the same for revoked/expired/PIN-protected links, title included, so
   crawlers learn nothing about link status. Unknown codes return the app's generic card.
4. Cache the image per physio branding version (e.g. include `updated_at` hash in the URL
   via metadata) so a logo change refreshes previews for new shares.
5. Font: bundle Outfit for `ImageResponse` (no network fetch at render).

## Security and privacy

- Resolving metadata must not update `open_count`/`last_opened_at` (crawler hits are not patient opens).
- The OG route uses only branding fields and the routine's or plan's name.
- The title is free text typed by the physio and shows to anyone the link is forwarded to, even
  for revoked, expired and PIN-protected links. The name fields in the routine and plan editors
  say so.

## i18n

`Patient.meta` keys for the generic title, the three descriptions and the image alt text;
`nameHint` under the routine and plan name fields.

## Acceptance criteria

- [x] WhatsApp, iMessage, Slack and Facebook debuggers show the branded card.
- [x] Physio share popover shows a preview of the card.
- [x] No customer data in any metadata; same card (title included) regardless of link status.
- [x] A routine or plan link shows its title on the image, in `og:title` and in the share popover.
- [x] Unit test for metadata builder; e2e asserts `og:image` responds with an image.

## Test plan

- Unit: metadata builder (locale, fallbacks without branding).
- E2E: fetch patient URL HTML, assert OG tags; fetch og image → `image/png`, 1200×630.

## Open questions

None. Answered when the title was added:

- Title on every known link, whatever its status (revoked, expired, PIN-protected too).
- Second line is the clinic name (the display name when no clinic name is set).
- Title also in `og:title`/`twitter:title`, and in the share popover preview.
- No clinic name in the text under the image; the browser tab shows the title too.

## Decisions made during implementation

- **Routine or plan title on the card (added after the first version).** The title is the
  headline and the clinic name a smaller second line; a customer link, which has no single item,
  keeps the clinic-name-only card (its item name is the patient's first name, never used).
  `LinkShell.title` comes from a left join on `routines`/`weekly_plans` in `resolveLink`, for every
  non-`not_found` status, so every status unfurls alike. The title goes into `previewVersion`, so a
  rename gives new shares a fresh image URL (a link without a title keeps its old version).
  `previewCopy` (`src/server/patient/preview-copy.ts`) builds title, description and alt text for
  both the page metadata and the share popover. The title is two lines at most and the clinic one
  line, with an ellipsis (Satori only clamps text in a block, not in a flex item). The tab title is
  now the routine's or plan's name too.

- **Route handler instead of the `opengraph-image` file convention.** Next serves that file at
  `/…/opengraph-image-<hash>`, where the hash comes from the file path, not from anything we can
  vary, and it injects its own `og:image` tag. Behaviour 4 (a logo change refreshes previews)
  needs a URL that carries the branding version, so the image is a plain route handler at
  `{link path}/og` and `generateMetadata` emits the `og:image`/`twitter:image` tags itself:
  `…/og?v={hash}`. The hash (`previewVersion`, `src/lib/link-preview.ts`, FNV-1a in base36) covers
  what the card draws (clinic name, logo URL, accent), so unrelated profile edits do not
  invalidate cached cards. Messaging apps cache hard, so it only helps new shares.
- **Metadata lives in the patient layout**, not the page, so the PIN gate and the unavailable
  page unfurl identically. `buildPreviewMetadata` (pure) builds title, description, Open Graph,
  Twitter (`summary_large_image`) and robots; the layout adds referrer, manifest and
  `appleWebApp`. The page title is now "Your exercise plan · {clinic}" (was the clinic name only),
  which carries no customer data.
- **Same card for every link status.** The image resolves the link by code only (no redirect, so
  a stale handle or slug works). Revoked, expired, PIN-protected and active links give
  byte-identical images; an unknown code gets a generic "Physio Trainer" card with a 200, so
  crawlers cannot tell the cases apart. Neither the metadata nor the image calls `touchLink`.
- **The card** is branding only: logo (or the clinic's initial), clinic name (type shrinks for
  long names), a 28 px accent bar, an 7 % accent tint and "Powered by Physio Trainer" (spec 09).
  The footer is the existing `Branding.poweredBy` copy in the customer's language; the generic card
  only has the product name. Colours come from the light brand tokens
  (`cardColors`); no accent means the app's neutral colours.
- **Logo** is fetched server-side with a 3 s timeout, accepted only as PNG or JPEG (magic bytes)
  up to 2 MB, and inlined as a data URI. Any failure draws the initial instead of failing the card.
- **Font:** `Outfit-Bold.ttf` (SIL OFL, licence beside it) in `src/assets/fonts/`, read once per
  instance; `outputFileTracingIncludes` in `next.config.ts` ships it with the route on Vercel
  (verified in the route's `.nft.json`). Only the Latin glyphs Outfit has render: a clinic name
  in CJK or emoji would show blanks.
- **Caching and headers:** `Cache-Control: public, max-age=3600` on the image, deliberately not the
  patient page's `no-store` (`isPatientPath` only matches the two-segment page URL): it holds only
  branding and is the same for every status, and a stale `?v=` simply gets the current card. A card
  drawn without its logo because the logo failed to load gets `max-age=60` so it is not pinned.
  `X-Robots-Tag: noindex, nofollow` keeps the image (whose URL has the link code) out of image
  search. Logo data URIs are kept in a 50-entry in-memory map (a new upload has a new URL), and a
  logo that declares more than 2 MB is refused before it is read.
- **Share popover** shows the real image (same-origin, lazy) with the host, title and description
  under it, in the customer's language (`ShareState.preview`, built from the same
  `Patient.meta` keys), and hides it once the link is revoked. The Settings branding link-card
  mock uses the same copy.
- **Verification environment** (first version, as in spec 10): no Docker daemon, so the app was built and run
  against a local Postgres 16 with stubbed `auth`/`storage` schemas, a static server for the
  logo and a small fake GoTrue. The patient-side e2e tests ran there; the popover e2e test and
  the physio-side sharing e2e need a real magic-link sign-in and run in CI only. The image was
  inspected for branded (with logo), no-branding/long-name and generic cards.
- **No integration test:** the change adds no table and no query; "crawlers are not opens" is
  covered by e2e (`open_count` stays 0 after fetching the page and image with a WhatsApp UA).
- **Verification of the title change:** no Docker here either. The migrations ran on a throwaway
  Postgres 16 with stubbed `auth`/`storage` schemas, `resolveLink` was run against it for routine,
  plan and customer links in every status, and the dev server was fetched over HTTP: revoked,
  expired and PIN links gave identical tags and byte-identical images, and a rename changed `?v=`.
  That check showed a routine can have only one live link, which the e2e seeding now respects.
  `patient.int.test.ts` and the e2e specs need local Supabase and run in CI only.
