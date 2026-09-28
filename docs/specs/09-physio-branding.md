# 09 · Physio branding

- **Status:** Done
- **Feature:** F (physio branding)
- **Depends on:** 01

## Summary

Patient-facing surfaces (patient page, link previews, PDFs) carry the physio's own identity:
logo, clinic name, accent colour and contact details. The physio workspace keeps the neutral
app look.

## Goals

- Settings → Branding: clinic/practice name, logo upload, accent colour, contact details and
  whether to show them to patients.
- Live preview of a patient page header and a PDF header.
- `getBranding(physioId)` server helper and `<BrandingStyle>` component that sets
  `--primary`/`--primary-foreground` (and dark-mode variants) for patient-facing pages.

## Non-goals

- Custom domains per physio (later).
- Custom fonts or full theme editors.

## Data model

Add to `physios`:

| Column                     | Type                          | Notes                                                     |
| -------------------------- | ----------------------------- | --------------------------------------------------------- |
| `clinic_name`              | text null                     | ≤ 80; falls back to `display_name`                        |
| `logo_path`                | text null                     | Storage `branding/{physio_id}/logo-{uuid}.{png,webp,jpg}` |
| `accent_color`             | text null                     | `#RRGGBB`; null = app default                             |
| `contact_email`            | text null                     |                                                           |
| `contact_phone`            | text null                     | also used for a WhatsApp "message your physio" button     |
| `website`                  | text null                     | https URL                                                 |
| `show_contact_to_patients` | boolean not null default true |                                                           |

Storage: bucket `branding`. The logo is **public-read** (it is shown in link previews and
PDFs, and holds no patient data); writes restricted to the owner by path prefix. SVG uploads
are sanitised or rejected (see open questions).

## Routes and UI

| Route                        | Kind         | Purpose                                                                    |
| ---------------------------- | ------------ | -------------------------------------------------------------------------- |
| `/settings?section=branding` | page section | Form + live preview cards (patient header, PDF header, link preview mock). |

- Accent colour: a curated palette of 10 swatches plus a custom hex input.
- Contrast guard: compute a readable `primary-foreground` (black/white) from the accent with
  the WCAG contrast ratio, and derive a dark-mode variant (lighter/desaturated). Reject or warn
  when contrast against the background is < 3:1 for large text/UI.

## Behaviour and rules

1. `src/lib/color.ts` (pure): hex parsing, OKLCH conversion, contrast ratio,
   `brandTokens(accent) → { light: {primary, primaryForeground}, dark: {...} }`.
2. `<BrandingStyle tokens>` renders a `<style>` scoped to the patient layout root
   (`[data-brand] { --primary: … }`) so the app shell is unaffected.
3. Logo: max 2 MB, resized/cropped client-side to ≤ 512 px; transparent PNG/WebP recommended.
4. When no branding is set, patient pages use the app defaults and the physio's display name.

## Security and privacy

- Only `physios` owner can update; logo bucket write policy by path prefix.
- Contact details are only shown to patients when `show_contact_to_patients` is true.

## i18n

Namespace `Settings.branding`.

## Acceptance criteria

- [x] Physio can set clinic name, logo, accent colour, contact details; preview updates live.
- [x] Contrast guard produces readable button text for every palette colour and custom colours.
- [x] `getBranding` + `BrandingStyle` ready for specs 10, 11, 14.
- [x] Logo upload restricted to the owner; public URL works without auth.

## Test plan

- Unit: colour maths and contrast (known pairs), token generation for light/dark.
- Integration: storage policies for the `branding` bucket.
- E2E: set accent colour → preview button colour changes.

## Open questions

1. SVG logos? → **No.** PNG, WebP and JPEG only (a public bucket serving SVG is a stored-XSS
   risk; raster works for OG images and PDFs).
2. App name on patient pages? → **Yes, a small "Powered by Physio Trainer" line** at the
   bottom of patient-facing surfaces, not fully white-label.
3. (Added) Low-contrast custom accent? → **Auto-adjust**: keep the chosen colour, derive
   light/dark tokens at the same hue with lightness nudged until ≥ 3:1; the form says so.
4. (Added) Settings layout? → **Tabs** driven by `?section=profile|branding|account`.

## Decisions made during implementation

- Logos are raster only (PNG/WebP/JPEG), identified on the server by magic bytes, not the
  browser MIME type. The picked file may be ≤ 10 MB; the browser resizes it to fit 512 px (no
  crop, no upscaling) and re-encodes it as WebP, falling back to PNG. The stored file is ≤ 2 MB
  (bucket limit plus server check). `serverActions.bodySizeLimit` is 3 MB in `next.config.ts`.
- The logo is uploaded inside the Server Action with the physio's own Supabase session, so the
  bucket RLS applies and the secret key is never used. Path
  `{physio_id}/logo-{uuid}.{png|webp|jpg}` in the public bucket `branding`; a new uuid per
  upload busts caches. The replaced logo is deleted after the transaction commits, and a failed
  DB update removes the new upload. The DB check `physios_logo_path_own` mirrors the storage
  folder rule.
- Contrast guard: tokens nudge OKLCH lightness at the same hue until ≥ 3:1 against `#ffffff`
  (light) and `#171717` (dark card). Button text is black or white, whichever contrasts more
  (≥ 4.5:1 for every colour, grid-tested). The dark variant is lighter only (desaturation only
  through gamut clamping). The form shows an "adjusted" note.
- Palette: 10 swatches (teal, sky, blue, indigo, violet, pink, red, orange, green, slate), each
  readable on white without adjustment (tested), plus Default (app colours) and a custom
  colour/hex input.
- Phone is stored as `+<digits>` (7-15 digits; a `00` prefix is accepted). Local numbers are
  rejected because WhatsApp links need the country code. Website must be https: bare domains
  get `https://`, `http://` is rejected, URLs with credentials are rejected.
- Settings became URL-driven tabs (`?section=profile|branding|account`).
- `getBranding(q, physioId)` takes a physio transaction or the owner `db` (spec 10, after link
  resolution) and returns `updatedAt` for spec 11's image cache key. Contact is null when
  hidden or empty. `buildBranding` (pure, `src/lib/branding.ts`) is shared with the settings
  preview.
- `<BrandingStyle tokens scope>` renders scoped `[data-brand="<scope>"]` light and
  `.dark [data-brand="<scope>"]` CSS. Usage:
  `<div data-brand="patient"><BrandingStyle scope="patient" …/>…</div>`. `<PoweredBy>` renders
  the "Powered by Physio Trainer" line (not white-label).
