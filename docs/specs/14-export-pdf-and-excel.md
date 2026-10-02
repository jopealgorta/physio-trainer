# 14 · PDF and Excel export

- **Status:** Not started
- **Feature:** Core
- **Depends on:** 05, 06, 09, 10

## Summary

Routines and weekly plans can be exported as a **branded PDF** (to print or send) and as an
**Excel `.xlsx`** workbook. The PDF includes exercise thumbnails and a QR code that opens the
live link, so a printed sheet always leads back to the latest version.

## Goals

- Physio: export a routine, a weekly plan, or everything active for a customer, as PDF or xlsx.
- Patient: "Download PDF" on the patient page.
- PDF in the customer's locale with the physio's branding.

## Non-goals

- Editable Word documents, Google Sheets integration.
- Exporting logs/visit notes (could be added later).

## Output design

**PDF** (A4 portrait by default; US Letter when the physio's locale suggests it):

1. Header: logo, clinic name, contact (if allowed); customer first name; date generated.
2. For a plan: a week overview table (days × routines), then each routine.
3. For each routine: name, phase label/date range, notes; exercise rows with thumbnail
   (cover image or video poster), name, prescription summary (`formatPrescription`),
   instructions (truncated to fit), item notes; a checkbox column per day for paper tracking.
   Note (spec 05): the prescription is per set (+ per item) since spec 05; render it with
   `formatPrescription`, and mark supersets.
4. Footer: QR code + short URL of the share link (customer link by default), page numbers.

**Excel**:

- Sheet "Overview" (plan week grid), one sheet per routine: columns Exercise, Sets, Reps,
  Hold, Duration, Rest, Load, Side, Notes, Instructions, Video link (signed/public page link).
- Header rows with physio and customer name; frozen header; column widths set.
- Note (spec 05): sets differ per set, so the Sets/Reps/Duration/Load columns hold the
  `formatPrescription` parts (or one row per set); superset members share a group label.

## Technical approach

- PDF: `@react-pdf/renderer` in a Route Handler (Node runtime), or HTML → PDF with headless
  Chromium if layout fidelity demands it. Decide in the plan; `@react-pdf/renderer` is
  recommended (no browser in production). Register Outfit font files locally.
- Excel: `exceljs`.
- QR: `qrcode` package (SVG/PNG data URL).
- Images: fetch signed URLs server-side, downscale thumbnails (e.g. `sharp`) to keep PDFs
  small (target < 2 MB for 10 exercises).
- Shared "export model" builder in `src/server/export/model.ts` that both formats consume
  (routine/plan → plain serialisable structure). Unit-test the builder.

## Routes

| Route                                             | Auth                     | Purpose                    |
| ------------------------------------------------- | ------------------------ | -------------------------- |
| `GET /api/export/routines/[id]?format=pdf\|xlsx`  | physio session           |                            |
| `GET /api/export/plans/[id]?format=pdf\|xlsx`     | physio session           |                            |
| `GET /api/export/customers/[id]?format=pdf\|xlsx` | physio session           | everything active today    |
| `GET /{handle}/{slug}/download`                   | share link (+PIN cookie) | PDF of what the link shows |

Responses set `Content-Disposition: attachment; filename="<slugified name>-<date>.pdf"` and
`Cache-Control: private, no-store`.

## Security and privacy

- Physio routes use `withPhysio`; patient download follows spec 10 resolution rules.
- The PDF contains only what the patient page shows (no case details or notes).

## i18n

Namespace `Export`; dates/units localised to the customer's locale.

## Acceptance criteria

- [ ] PDF and xlsx for routine, plan, customer; patient PDF download.
- [ ] Branding, QR code to the live link, thumbnails; readable in greyscale print.
- [ ] Files open correctly in Acrobat/Preview and Excel/Numbers/LibreOffice.
- [ ] 10-exercise routine PDF < 2 MB and generated in < 3 s locally.

## Test plan

- Unit: export model builder; filename builder.
- Integration: route handlers return correct content types and deny other physios' ids.
- E2E: click "Export PDF" → download event with `.pdf`; patient "Download PDF" works.

## Open questions (answered 2026-10-02)

1. Should the paper checkbox tracking column be included by default?
   **Yes, as a toggle**: the physio's export menu has "Include tracking boxes", checked by
   default. The patient's "Download PDF" always includes them.
2. A4 vs Letter: follow locale automatically, or a physio setting?
   **Always A4.** No setting and no locale heuristic (locales carry no region).
3. QR target when the customer has no live link yet? **Create it** (`ensureShareLink` for the
   customer link, as opening Share does). A revoked or expired customer link stays that way and
   the PDF has no QR; same for an archived customer.
4. Templates (no customer)? **Not exported**, like the Share button.

## Decisions made during implementation

(Fill in while building.)
