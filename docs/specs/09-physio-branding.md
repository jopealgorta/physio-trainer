# 09 · Physio branding

- **Status:** Not started
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
| `logo_path`                | text null                     | Storage `branding/{physio_id}/logo-{uuid}.{png,webp,svg}` |
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

- [ ] Physio can set clinic name, logo, accent colour, contact details; preview updates live.
- [ ] Contrast guard produces readable button text for every palette colour and custom colours.
- [ ] `getBranding` + `BrandingStyle` ready for specs 10, 11, 14.
- [ ] Logo upload restricted to the owner; public URL works without auth.

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

(Fill in while building.)
