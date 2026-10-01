# 16 · Visit notes

- **Status:** Not started
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

(Fill in while building.)
