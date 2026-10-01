# Plan: 11 · Link previews

Spec: [`docs/specs/11-link-previews.md`](../specs/11-link-previews.md). Approved design (chat, 2026-10-01).

1. **Pure helpers** `src/lib/link-preview.ts` (test-first): `previewVersion`, `previewImagePath`,
   `buildPreviewMetadata`, `cardColors` (accent → card colours, neutral fallback).
2. **i18n**: `Patient.meta.{title,description,imageAlt}` and `Sharing.preview.*` in `en` and `es`;
   align the Settings link-card mock copy with `Patient.meta`.
3. **Patient layout metadata**: `generateMetadata` builds title/description in the customer's
   locale and points `og:image` at the versioned image route. No `touchLink`.
4. **Image route** route handler `[slug]/og/route.tsx` (not the `opengraph-image` file convention: its URL carries a hash we cannot version) + `src/server/patient/og-image.tsx`: bundled Outfit Bold
   (`src/assets/fonts`, traced via `outputFileTracingIncludes`), logo fetched and inlined as a data
   URI (png/jpeg sniffed, ≤ 2 MB, falls back to the initial), generic card for unknown codes,
   `Cache-Control: public, max-age=3600`.
5. **Share popover preview**: `ShareState.preview`, a `LinkPreviewCard` in `ShareLinkPanel`
   (hidden when revoked).
6. **Tests**: unit (helpers, card colours, logo loader, panel), integration (open count untouched),
   e2e (tags, image 1200×630 png, same card for revoked/PIN, generic card, popover).
7. **Docs**: spec Status/decisions, index table.
