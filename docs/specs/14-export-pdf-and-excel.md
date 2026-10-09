# 14 · PDF and Excel export

- **Status:** Done
- **Feature:** Core
- **Depends on:** 05, 06, 09, 10

## Summary

Routines and weekly plans can be exported as a **branded PDF** (to print or send) and as an
**Excel `.xlsx`** workbook. The PDF links each exercise's video and carries a QR code that opens
the live link, so a printed sheet always leads back to the latest version.

## Goals

- Physio: export a routine, a weekly plan, or everything active for a customer, as PDF or xlsx.
- Patient: "Download PDF" on the patient page.
- PDF in the customer's locale with the physio's branding.

## Non-goals

- Editable Word documents, Google Sheets integration.
- Exporting logs/visit notes (could be added later).

## Output design

**PDF** (A4 portrait by default; US Letter when the physio's locale suggests it):

1. Header: logo, clinic name, contact (if allowed, email and website clickable); customer first
   name; date generated. From page 2 on, a running header repeats the title and customer.
2. For a plan: a week overview table (days × routines), then each routine.
3. For each routine: name, phase label/date range, notes (in a callout); exercise rows with a
   number (1, 2, 3… through the routine; A1, A2 inside a superset), name, prescription summary
   (`formatPrescription`), item notes, full instructions, and a "Watch video" link when the
   exercise has one. Note (spec 05): the prescription is per set (+ per item) since spec 05;
   render it with `formatPrescription`, and mark supersets.
4. Footer: QR code + short URL of the share link (customer link by default), page numbers.

Revised 2026-10-09 after physio feedback: video thumbnails and the per-day tracking boxes were
removed (neither was useful), each video became a link, and the clinic accent colour is used
sparingly (see "Decisions made during implementation").

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
- Images: only the clinic logo, fetched server-side (target < 2 MB for 10 exercises).
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

- [x] PDF and xlsx for routine, plan, customer; patient PDF download.
- [x] Branding, QR code to the live link, video links; readable in greyscale print.
- [x] Files open correctly in Acrobat/Preview and Excel/Numbers/LibreOffice. Checked in macOS
      Preview/Quick Look (PDF and xlsx) and by an exceljs read-back; Acrobat, Excel and LibreOffice
      were not available to check.
- [x] 10-exercise routine PDF < 2 MB and generated in < 3 s locally (unit test: about 175 KB,
      about 160 ms with ten distinct covers).

## Test plan

- Unit: export model builder; filename builder.
- Integration: route handlers return correct content types and deny other physios' ids.
- E2E: click "Export PDF" → download event with `.pdf`; patient "Download PDF" works.

## Open questions (answered 2026-10-02)

1. Should the paper checkbox tracking column be included by default?
   **Yes, as a toggle**: the physio's export menu has "Include tracking boxes", checked by
   default. The patient's "Download PDF" always includes them. _Superseded 2026-10-09: the boxes
   and the toggle were removed; `?tracking=` is ignored so saved URLs keep working._
2. A4 vs Letter: follow locale automatically, or a physio setting?
   **Always A4.** No setting and no locale heuristic (locales carry no region).
3. QR target when the customer has no live link yet? **Create it** (`ensureShareLink` for the
   customer link, as opening Share does). A revoked or expired customer link stays that way and
   the PDF has no QR; same for an archived customer.
4. Templates (no customer)? **Not exported**, like the Share button.

## Decisions made during implementation

- **One model, two renderers.** Loaders produce an `ExportSource`; the pure
  `buildExportDocument` (`src/server/export/model.ts`) turns it into the `ExportDocument` both the
  PDF (`src/server/export/pdf/`) and xlsx (`src/server/export/xlsx.ts`) renderers read.
- **Shared routine content.** The patient view's private loader moved to
  `src/server/routines/content.ts` as `loadRoutineContent(q, physioId, customerId, ids)` (it
  filters by physio and customer itself). The patient page and patient PDF use the owner `db`, the
  physio export uses its RLS transaction. The patient page's plan-entry query became
  `linkPlanEntries` next to `linkScopes` in `src/server/patient/view.ts`, so the page and the PDF
  share one definition of what a link can see.
- **No `sharp`.** Thumbnails are YouTube's `mqdefault.jpg` (320×180, about 15 KB), fetched
  server-side with a 2 s timeout, a 512 KB streaming cap, a PNG/JPEG check and an LRU cache; any
  failure renders a grey box. The fetch helper lives in `src/server/images.ts` and the link-preview
  logo uses it too.
- **Fonts** are read from `src/assets/fonts` at runtime (Outfit Regular is new, a static file from
  the upstream Outfit repo), so `next.config.ts` traces them for the export routes. Both packages
  are `serverExternalPackages`. Outfit has no italic, so item notes are grey with a bold "Notes:" prefix.
- **Layout.** Routines flow one after another (no page break per routine). A routine's heading
  stays on the same page as its first exercise, and an item is never split across pages. The
  clinic header is on the first page only; the footer (QR, short URL, page numbers) is on every
  page. Tracking boxes appear only on the days a plan schedules the routine, or on all seven days
  for a routine outside a plan. Instructions are cut at 280 characters in the PDF and kept in
  full in the xlsx.
- **QR target** is always the customer's link (created on first export if none exists). Only the
  PDF needs it, so an xlsx export never creates a link. The patient PDF points at the link it was
  downloaded from.
- **Scope.** A physio's plan export includes draft routines, matching the plan board. The
  customer export and the patient PDF only include what is active today (`scheduleFilter`), with
  every weekday of the plan. Phase labels and dates appear only in the physio's export, since the
  patient page shows none. Headers name the customer by first name only.
- **Patient download.** When the link has become PIN-locked or unavailable, the download
  answers `303` to the page, which shows the PIN gate or the "unavailable" screen. The button is a
  plain link with no `download` attribute, so the browser follows that redirect instead of saving
  HTML; `Content-Disposition: attachment` still downloads the PDF. The route sets
  `PATIENT_HEADERS` itself, because the proxy only matches 2- and 4-segment patient paths.
  Downloads don't count as link opens.
- **Filenames** are `<slug>-<YYYY-MM-DD>.<ext>`, sent as ASCII `filename` plus a
  UTF-8 `filename*` (RFC 5987).
- **Excel.** There is one row per exercise. A value that differs per set is joined
  ("12 / 10 / 8") and collapses to one value when every set matches; numbers stay numeric when
  single-valued. Superset members share a group label (A1, A2). Routine notes and frequency sit
  above the frozen header row (row 6).
- **Unrelated test fix.** Two `plan-board.test.tsx` tests raced `useOptimistic` reverting
  (`main` CI was red on them); they now hold the action pending while they assert.

### Content revision (2026-10-09)

Physio feedback: the video thumbnail did not help, the tracking boxes went unused, and a link to
the video was wanted. Answers to the clarifying questions: the video is a link only (on paper the
footer QR still leads to the live page and every video); the clinic accent colour, exercise
numbers and the polish below were in scope, a labelled prescription strip was not; the retired
`tracking` query parameter is ignored rather than rejected.

- **No thumbnails.** YouTube covers are no longer fetched (`src/server/export/images.ts` is
  gone); the logo is the PDF's only image. _Supersedes "No `sharp`" above._
- **No tracking boxes.** Removed from the PDF, the patient download and the Export menu
  (`ExportSource.tracking` is gone). _Supersedes the tracking-box sentence under "Layout"._
- **Video link.** "Watch video" with a drawn play triangle (Outfit has no ▶ glyph), in a right
  column level with the exercise name, linking `item.videoUrl`. The right column also keeps
  instruction lines to a comfortable length now the thumbnail column is gone.
- **Numbers.** A left gutter numbers single exercises 1, 2, 3… through a routine (across its
  sections, restarting per routine); superset members keep A1, A2. The superset bar sits in the
  page margin so every name lines up.
- **Accent.** `ExportSource.branding.accentColor` is the physio's accent as set; the PDF uses
  `printAccent` (`src/lib/color.ts`: darkened, same hue, to 4.5:1 on white, since it is small
  text on paper) for the bar under the title, section headings, the superset bar and caption,
  the routine-notes rule and video links. Without an accent these are the neutral text colour.
- **Full instructions.** No 280-character cut. An exercise still never splits across pages,
  unless its instructions exceed 1,200 characters; then it may, but its name, dose and notes stay
  together. A routine title or section heading followed by such an exercise no longer forces it
  onto one page (react-pdf would overflow the page and lose text); `minPresenceAhead` keeps the
  heading off the bottom of a page instead.
- **Row layout.** The number and the video link are absolutely positioned and the body carries
  the gutter as margins: when a long exercise breaks, react-pdf drops flex columns that already
  printed, and the continuation would lose its indent.
- **Polish.** A running header (title · "For {name}") on pages after the first; the email,
  website and footer short URL are links (the phone is not); routine notes sit in a grey callout
  with an accent rule; 40 pt page margins.
