# 16 · Visit notes

- **Status:** Done
- **Feature:** J (session / clinical notes)
- **Depends on:** 04

## Summary

Physios record a short note per visit using the SOAP structure (Subjective, Objective,
Assessment, Plan), optionally linked to a case, with a pain score. Notes are private to the
physio and never shown to patients. Kept deliberately small so the app doesn't turn into a
full medical-records system.

## Goals

- Create, edit and delete visit notes on the customer page (**Notes** tab).
- Timeline of notes, filterable by case; quick "New note" prefilled with today's date.

## Non-goals

- Appointment scheduling, billing codes, attachments, templates for notes, e-signatures.
- Linking a note to the routines/plans changed in that visit (dropped for v1, see open question 2).
- Structured outcome measures (feature K, deferred).

## Data model

`visit_notes`:

| Column                        | Type                                | Notes                    |
| ----------------------------- | ----------------------------------- | ------------------------ |
| `id`, `physio_id`, timestamps |                                     |                          |
| `customer_id`                 | uuid not null → customers (cascade) |                          |
| `case_id`                     | uuid null → cases (`set null`)      | same customer (validate) |
| `visited_on`                  | date not null default today         |                          |
| `subjective`                  | text null                           | ≤ 10 000 each            |
| `objective`                   | text null                           |                          |
| `assessment`                  | text null                           |                          |
| `plan`                        | text null                           |                          |
| `pain`                        | smallint null                       | 0–10                     |

At least one of the four SOAP fields must be non-empty. Index `(customer_id, visited_on desc)`.

## Routes and UI

| Route                       | Purpose                                                                                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/customers/[id]?tab=notes` | Timeline (newest first): date, case badge, pain, first lines of each SOAP section; expand to read; filter by case.                                          |
| Note editor                 | Sheet (desktop) / full-screen (mobile) with four auto-growing text areas labelled S/O/A/P, date, case, pain. Draft autosaved to `localStorage` until saved. |

Keyboard: `N` opens a new note on the Notes tab; `Cmd/Ctrl+Enter` saves.

## Behaviour and rules

1. Notes are editable at any time; show "edited" with `updated_at` when it differs from
   `created_at` by more than a minute.
2. Delete requires confirmation.
3. Customer overview (spec 04) shows the latest note's date and assessment excerpt.

## Security and privacy

- Tenancy rules apply. Visit notes are never selected by any code in `src/server/patient/` or
  export routes (add a test that greps/imports to assert this boundary, or a lint rule).

## i18n

Namespace `VisitNotes`.

## Acceptance criteria

- [ ] CRUD notes with SOAP fields, date, case, pain; timeline with case filter.
- [ ] Drafts survive an accidental close; save shortcut works.
- [ ] RLS integration tests; patient boundary test.

## Test plan

- Unit: zod schema (at least one SOAP field), excerpt helper.
- Integration: RLS; case/customer consistency.
- E2E: write a note → appears in timeline → edit → shows "edited".

## Open questions

1. Is SOAP the structure you use, or would free-form notes with optional headings fit better?
   **Answer:** SOAP as specced.
2. The goals mention an optional link to the routines/plans changed in a visit but the data
   model has no column for it. **Answer:** drop it for v1; the Routines and Plans tabs already
   show what exists.
3. Notes on archived customers? **Answer:** allowed, same as cases (archived customers stay
   viewable and editable).
4. Timeline pagination? **Answer:** newest 20 with a "Load more" button.

## Decisions made during implementation

- **Case consistency in the database**: `visit_notes (physio_id, customer_id, case_id)` references
  `cases (physio_id, customer_id, id)` with `ON DELETE SET NULL (case_id)` (custom migration), so
  a note can never point at another customer's or physio's case and deleting a case only clears
  `case_id`. The mutations map that FK violation to a `caseNotFound` error. Checks also back the
  rules: pain 0–10, each SOAP field ≤ 10 000 characters, and at least one non-blank SOAP field.
  Blank SOAP fields are stored as `null` (text is trimmed on write).
- **Dates**: `visited_on` defaults to today in the physio's time zone (the editor prefills it and
  the action fills it in when blank on create); a blank date on edit keeps the current one.
- **Timeline**: `?tab=notes&case=<id>&notes=<n>`. Newest visit first (ties by creation time),
  20 at a time; "Load more" is a link that raises `notes` by 20 (capped at 500). A `case` that
  isn't one of the customer's cases is ignored. Collapsed cards clamp each section to two lines
  and offer "Show full note" only when something is hidden.
- **No silent truncation**: the S/O/A/P text areas have no `maxLength`; a paste over 10 000
  characters is kept and the server reports "use at most 10,000 characters", so nothing is lost.
- **Visit date upper bound**: a date later than today in UTC+14 (the furthest-ahead time zone) is
  rejected (`dateInFuture`), so a typo like 2062 can't pin a note to the top of the timeline or
  the overview card. Today in every time zone is accepted.
- **"Edited" and case deletion**: the `updated_at` trigger skips the one update where the FK action
  nulls `case_id` and nothing else changed, so deleting a case doesn't make its notes look
  edited. Clearing the case in the editor together with any content change still bumps it.
- **Timeline cap**: "Load more" stops at 500 notes (the `notes` param is clamped). Older notes
  stay reachable through the case filter. Cursor pagination wasn't worth it for this volume.
- **Editor**: a right-hand sheet that is full width on mobile. The four S/O/A/P fields are
  auto-growing text areas (`field-sizing-content`). Pain is a numeric text input like the case's
  initial pain.
- **Drafts**: every change is written to `localStorage` (per customer and per note; none while the
  form equals the saved values) and restored, with a "Discard draft" option, when the editor
  reopens. Storage failures are swallowed; a successful save or deleting the note clears its
  draft, and editing again after a save resumes autosave. Drafts are plaintext in the browser
  profile and are not cleared on sign-out (a known trade-off of the spec's draft requirement:
  avoid typing patient details into shared browsers).
- **Shortcuts**: `N` opens a new note only from the Notes tab, and is ignored while typing, with
  modifiers, or while any dialog is open. `Cmd/Ctrl+Enter` submits the form.
- **"Edited"** shows when `updated_at` is more than a minute after `created_at`; the date comes
  from the physio's time zone.
- **Overview card** shows the latest note's date and its assessment excerpt (200 characters),
  falling back to the first non-empty of S, O, P when there is no assessment.
- **Patient boundary test** (`patient-boundary.test.ts`) is an allow-list: only `db/`, the notes
  server and component folders, the overview, the customer page and `i18n/` may mention visit
  notes, and `server/patient/`, `app/(patient)/`, `app/api/` and anything named `*export*` may not.
  Any new file elsewhere that mentions them fails the test.
- **Archived customers** can still have notes added, edited and deleted (same as cases).
- **Routine/plan links dropped for v1**: see open question 2; the goal line was removed.
- **Side effect**: `Customers.tabEmpty.notes` and the `notes` branch of `TabEmpty` were removed
  because the tab is built. Adding messages pushed `category-manager.tsx` over TypeScript's
  type-instantiation depth limit (its context typed the translator as the un-namespaced
  `useTranslations`), so it now types it as `useTranslations<"Library.categories">`.
