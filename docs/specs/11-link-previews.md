# 11 · Link previews

- **Status:** Done
- **Feature:** E (rich link previews)
- **Depends on:** 09, 10

## Summary

When a physio pastes a patient link into WhatsApp, iMessage, email or Slack, it unfurls into a
clean card with the physio's logo, clinic name and accent colour, instead of a bare URL.
Previews never contain health information.

## Goals

- Open Graph and Twitter card metadata for patient links.
- Generated OG image (1200×630) per physio branding.
- A physio-facing preview of how the card will look (in the share popover).

## Non-goals

- Per-customer or per-routine imagery (privacy: previews are visible to anyone the link is
  forwarded to and are cached by the messaging apps).

## Behaviour

1. `generateMetadata` on the patient route returns:
   - `title`: "Your exercise plan · {clinic name}" (localised to the customer's locale),
   - `description`: "Open your routine from {clinic name}." No names of exercises, injuries,
     or the patient.
   - `openGraph.images`: the image route, versioned (`…/og?v=…`).
   - `robots: { index: false }`.
2. `src/app/(patient)/[handle]/[slug]/og/route.tsx` (a route handler, not the `opengraph-image`
   file convention, see Decisions; Next 16: `params` is a Promise): renders logo (from the public `branding` bucket),
   clinic name, and a subtle accent-colour background using `ImageResponse`.
3. Metadata and image are the same for revoked/expired/PIN-protected links (generic, no data),
   so crawlers learn nothing about link status. Unknown codes return the app's generic card.
4. Cache the image per physio branding version (e.g. include `updated_at` hash in the URL
   via metadata) so a logo change refreshes previews for new shares.
5. Font: bundle Outfit for `ImageResponse` (no network fetch at render).

## Security and privacy

- Resolving metadata must not update `open_count`/`last_opened_at` (crawler hits are not patient opens).
- The OG route uses only branding fields.

## i18n

`Patient.meta` keys for title/description.

## Acceptance criteria

- [x] WhatsApp, iMessage, Slack and Facebook debuggers show the branded card.
- [x] Physio share popover shows a preview of the card.
- [x] No patient/health data in any metadata; same card regardless of link status.
- [x] Unit test for metadata builder; e2e asserts `og:image` responds with an image.

## Test plan

- Unit: metadata builder (locale, fallbacks without branding).
- E2E: fetch patient URL HTML, assert OG tags; fetch og image → `image/png`, 1200×630.

## Open questions

None.

## Decisions made during implementation

- **Route handler instead of the `opengraph-image` file convention.** Next serves that file at
  `/…/opengraph-image-<hash>`, where the hash comes from the file path, not from anything we can
  vary, and it injects its own `og:image` tag. Behaviour 4 (a logo change refreshes previews)
  needs a URL that carries the branding version, so the image is a plain route handler at
  `{link path}/og` and `generateMetadata` emits the `og:image`/`twitter:image` tags itself:
  `…/og?v={physios.updated_at in base36}` (`previewVersion`, `src/lib/link-preview.ts`). The
  version changes on any change to the physio row (logo, name, accent, contact), which is
  coarser than needed but cheap. Messaging apps cache hard, so it only helps new shares.
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
  No text is localised (the clinic name is the only copy). Colours come from the light brand tokens
  (`cardColors`); no accent means the app's neutral colours.
- **Logo** is fetched server-side with a 3 s timeout, accepted only as PNG or JPEG (magic bytes)
  up to 2 MB, and inlined as a data URI. Any failure draws the initial instead of failing the card.
- **Font:** `Outfit-Bold.ttf` (SIL OFL, licence beside it) in `src/assets/fonts/`, read once per
  instance; `outputFileTracingIncludes` in `next.config.ts` ships it with the route on Vercel
  (verified in the route's `.nft.json`). Only the Latin glyphs Outfit has render: a clinic name
  in CJK or emoji would show blanks.
- **Caching:** `Cache-Control: public, max-age=3600` on the image. Safe because it holds only
  branding and is the same for every status; a stale `?v=` simply gets the current card.
- **Share popover** shows the real image (same-origin, lazy) with the host, title and description
  under it, in the customer's language (`ShareState.preview`, built from the same
  `Patient.meta` keys), and hides it once the link is revoked. The Settings branding link-card
  mock uses the same copy.
- **Verification environment** (as in spec 10): no Docker daemon, so the app was built and run
  against a local Postgres 16 with stubbed `auth`/`storage` schemas, a static server for the
  logo and a small fake GoTrue. The patient-side e2e tests ran there; the popover e2e test and
  the physio-side sharing e2e need a real magic-link sign-in and run in CI only. The image was
  inspected for branded (with logo), no-branding/long-name and generic cards.
- **No integration test:** the change adds no table and no query; "crawlers are not opens" is
  covered by e2e (`open_count` stays 0 after fetching the page and image with a WhatsApp UA).
