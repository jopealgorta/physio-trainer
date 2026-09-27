# 04 · Customers and cases

- **Status:** Not started
- **Feature:** Core
- **Depends on:** 01, 02

## Summary

Physios keep a list of customers (patients) with basic info and one or more **cases**: an
injury episode with diagnosis, body area, key dates and precautions. The customer page is the
hub where routines, weekly plans, share links, logs and visit notes will appear as later specs
land.

## Goals

- Create, edit, archive customers; searchable, sortable list.
- Cases per customer: create, edit, close/reopen.
- Customer detail page with tabs that later specs fill: Overview, Routines, Plans, Activity,
  Notes.
- Customer `locale` (language of their patient page and PDFs).

## Non-goals

- Appointments/calendar, billing, documents/attachments (MRI reports): not planned.
- Consent capture and data export/deletion tooling (feature N, deferred).
- Visit notes: spec 16.

## User stories

- As a physio, I add Ana García with her phone and email and note she's a runner.
- As a physio, I open a case "Right ACL reconstruction" with surgery date and precautions.
- As a physio, I find a customer by typing part of their name.

## Data model

`customers`:

| Column                        | Type                                               | Notes                                                          |
| ----------------------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| `id`, `physio_id`, timestamps |                                                    |                                                                |
| `first_name`                  | text not null                                      | 1–60                                                           |
| `last_name`                   | text null                                          | ≤ 60                                                           |
| `email`                       | text null                                          | validated                                                      |
| `phone`                       | text null                                          | free text, ≤ 30 (store as typed; E.164 normalisation optional) |
| `date_of_birth`               | date null                                          |                                                                |
| `sex`                         | enum `female \| male \| other \| undisclosed` null |                                                                |
| `occupation`                  | text null                                          |                                                                |
| `activity`                    | text null                                          | sport/activity level, free text                                |
| `medical_history`             | text null                                          | general history, meds, allergies (≤ 5 000)                     |
| `locale`                      | text not null default physio's locale              |                                                                |
| `archived_at`                 | timestamptz null                                   |                                                                |

Indexes: `(physio_id, archived_at)`, trigram on `first_name || ' ' || coalesce(last_name,'')`.

`cases`:

| Column                                                 | Type                                          | Notes                                                  |
| ------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------ |
| `id`, `physio_id`, `customer_id` (cascade), timestamps |                                               |                                                        |
| `title`                                                | text not null                                 | e.g. "Right ACL reconstruction"                        |
| `diagnosis`                                            | text null                                     |                                                        |
| `body_area`                                            | `body_area` null                              | spec 02 (excluding `full_body`)                        |
| `side`                                                 | `body_side` null                              |                                                        |
| `injury_on`                                            | date null                                     |                                                        |
| `surgery_on`                                           | date null                                     |                                                        |
| `precautions`                                          | text null                                     | contraindications / things to avoid; shown prominently |
| `goals`                                                | text null                                     | patient goals                                          |
| `initial_pain`                                         | smallint null                                 | 0–10                                                   |
| `notes`                                                | text null                                     |                                                        |
| `status`                                               | enum `open \| closed` not null default `open` |                                                        |
| `opened_on`                                            | date not null default today                   |                                                        |
| `closed_on`                                            | date null                                     | set when closed                                        |

## Routes and UI

| Route                          | Kind            | Purpose                                                                                                                                                                                                                                                             |
| ------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/customers`                   | page            | Search box, list/table (name, active case, last activity placeholder), "New customer". Toggle to show archived. Mobile: cards.                                                                                                                                      |
| `/customers/new`               | page (or sheet) | Short form: first name required, everything else optional; "more details" disclosure.                                                                                                                                                                               |
| `/customers/[customerId]`      | page            | Header (name, age, contact quick actions: call, email, WhatsApp link), tabs: **Overview** (basic info, open cases with precautions highlighted), **Routines** (spec 05), **Plans** (06), **Activity** (13), **Notes** (16). Tabs not yet built show an empty state. |
| `/customers/[customerId]/edit` | page            | Full form.                                                                                                                                                                                                                                                          |
| Case form                      | sheet/dialog    | Create/edit case with `BodyAreaPicker` single + side. Close/reopen.                                                                                                                                                                                                 |

Tabs are URL-addressable (`?tab=routines` or nested routes; choose one and reuse it).

## Behaviour and rules

1. Archiving a customer revokes their share links (spec 10 adds the revoke; leave a TODO hook
   `onCustomerArchived` in the service) and hides them from the list. Restoring does not
   re-enable links.
2. Age is derived from `date_of_birth` in the physio's timezone.
3. Closing a case sets `closed_on` = today (editable). Routines linked to it stay as they are.
4. Hard delete is not offered in v1 (archive only).

## Security and privacy

- Tenancy rules apply (physio_id + RLS via `withPhysio`).
- Customer data is never exposed on patient pages except: first name, locale, and whatever
  spec 10 explicitly lists.

## i18n

Namespaces `Customers`, `Cases`. Dates formatted with the physio's locale.

## Acceptance criteria

- [ ] Create/edit/archive/restore customers; search is accent-insensitive and partial.
- [ ] Create/edit/close/reopen cases with body area + side.
- [ ] Customer detail page with URL-addressable tabs and empty states for future tabs.
- [ ] Precautions of open cases are visually prominent on the overview.
- [ ] RLS integration tests for `customers` and `cases`.

## Test plan

- Unit: zod schemas (dates, pain range), age calculation.
- Integration: RLS; search; case close/reopen.
- E2E: create customer → add case → see it on overview; search finds the customer.

## Open questions

1. Any other customer fields you always record (e.g. referring doctor, insurance, ID number)?
2. Should customers get a colour/avatar, or keep it minimal with initials?

## Decisions made during implementation

(Fill in while building.)
