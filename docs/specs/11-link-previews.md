# 11 · Link previews

- **Status:** Not started
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
   - `openGraph.images`: the route's `opengraph-image`.
   - `robots: { index: false }`.
2. `src/app/(patient)/[handle]/[slug]/opengraph-image.tsx` (Next 16: `params` is a Promise,
   see `node_modules/next/dist/docs/`): renders logo (from the public `branding` bucket),
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

- [ ] WhatsApp, iMessage, Slack and Facebook debuggers show the branded card.
- [ ] Physio share popover shows a preview of the card.
- [ ] No patient/health data in any metadata; same card regardless of link status.
- [ ] Unit test for metadata builder; e2e asserts `og:image` responds with an image.

## Test plan

- Unit: metadata builder (locale, fallbacks without branding).
- E2E: fetch patient URL HTML, assert OG tags; fetch og image → `image/png`, 1200×630.

## Open questions

None.

## Decisions made during implementation

(Fill in while building.)
