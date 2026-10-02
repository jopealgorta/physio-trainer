# 13 · Session logging and dashboard

- **Status:** Not started
- **Feature:** D (adherence + pain logging)
- **Depends on:** 10 (integrates with 12 if present)

## Summary

Patients mark a routine as done for a day, rate their pain 0–10 and leave an optional comment,
straight from their link. Physios see adherence and pain trends per customer and a dashboard
of who needs attention. This is what makes the app better than sending a PDF.

## Goals

- Patient: "Mark as done" per routine per day (plan entry or single routine), pain slider,
  comment; edit today's and yesterday's logs.
- Physio: customer **Activity** tab (calendar heatmap, pain chart, comments feed) and the
  **Dashboard** (`/dashboard`) replacing its placeholder.

## Non-goals

- Per-exercise logging (sets/reps/weight actually done).
- Notifications to the physio (could come with reminders, feature O).

## Data model

`session_logs`:

| Column                        | Type                                         | Notes                         |
| ----------------------------- | -------------------------------------------- | ----------------------------- |
| `id`, `physio_id`, timestamps |                                              |                               |
| `customer_id`                 | uuid not null → customers (cascade)          |                               |
| `share_link_id`               | uuid null → share_links (`set null`)         | link used to log              |
| `routine_id`                  | uuid not null → routines (cascade)           |                               |
| `weekly_plan_entry_id`        | uuid null → weekly_plan_entries (`set null`) | context when done from a plan |
| `performed_on`                | date not null                                | patient's local date          |
| `completed`                   | boolean not null default true                |                               |
| `pain`                        | smallint null                                | 0–10 check                    |
| `comment`                     | text null                                    | ≤ 1 000                       |
| `seen_by_physio_at`           | timestamptz null                             | for "new comments" badges     |

Unique `(routine_id, weekly_plan_entry_id, performed_on)` **nulls not distinct** (one log per
routine per entry per day; editing updates it).

## Routes and UI

Patient (on the page from spec 10, and the finish screen from spec 12):

- Each routine card for today has a "Mark as done" button → bottom sheet: pain 0–10 (large
  segmented control with faces/colour scale, optional), comment, Save. Done state shows a check
  and "Edit".
- Week strip shows a check on days with logs.

Physio:

| Route                          | Purpose                                                                                                                                                                                                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/customers/[id]?tab=activity` | 12-week calendar heatmap (completed / planned), pain line chart over time (per routine or overall), comments feed; marks comments as seen.                                                                                                                                 |
| `/dashboard`                   | Cards: "Needs attention" (pain ≥ 7 in last 7 days, or pain up ≥ 3 points week over week, or adherence < 50 % last 7 days), "New comments", "Recently active", simple totals (active customers, sessions logged this week). Each item links to the customer's Activity tab. |

Charts follow the repo's dataviz conventions (tokens, light/dark, accessible labels).

## Behaviour and rules

1. Logging goes through a Server Action in `src/server/patient/log-session.ts`: resolve link
   (spec 10 rules, PIN included) → verify the routine (and entry) is reachable from the link
   and active on `performed_on` → upsert.
2. `performed_on` comes from the patient's device date; accept only today or yesterday in the
   physio's timezone ±1 day. Older dates are rejected.
3. ~~Rate limit: 30 writes per link per hour.~~ Dropped (see Open questions 3).
4. **Adherence** = logged-completed sessions / planned sessions in a window. Planned sessions:
   plan entries per active day + single routines' `sessions_per_week` (pro-rated). Implement in
   `src/lib/adherence.ts` (pure, unit-tested) using the spec 08 active-on-date helper.
5. Physio can't edit or hide patient logs (see Open questions 2).

## Security and privacy

- Patient writes are scoped by the resolved link; no ids trusted without reachability check.
- RLS on `session_logs` for physio reads; patient writes use the owner connection per
  architecture rule 3.
- Comments are rendered as plain text (no HTML/markdown) everywhere.

## i18n

Namespaces `Patient.logging`, `Activity`, `Dashboard`.

## Acceptance criteria

- [ ] Patient can log/edit today's and yesterday's sessions with pain and comment; state persists.
- [ ] Cross-customer and unreachable-routine writes rejected (integration tests).
- [ ] Activity tab heatmap, pain chart and comments feed; comments marked seen.
- [ ] Dashboard "Needs attention" rules implemented and unit-tested; links to customers.
- [ ] Workout finish screen (spec 12) opens the log sheet when both specs are done.

## Test plan

- Unit: adherence calculation (plans + single routines, phase windows), attention rules.
- Integration: log upsert/uniqueness, reachability, date window, RLS.
- E2E: patient logs pain 6 → physio dashboard shows it under recently active; pain 8 → needs attention.

## Open questions

1. Are the "needs attention" thresholds right (pain ≥ 7, +3 week over week, < 50 % adherence)?
   **Answer (2026-10-02):** yes, as specced. The adherence rule applies only when something is
   planned and the customer has a usable share link; the week-over-week rule only when both weeks
   have a pain rating.
2. Should physios be able to hide/delete a patient log?
   **Answer:** no. Logs are read-only for physios (rule 5); patients correct their own.
3. (Raised while designing) The 30 writes/link/hour rate limit (rule 3) vs spec 10, which shipped
   no limiter. **Answer:** no limiter. The upsert already caps rows (one per routine, entry and
   day), so a flood can only rewrite existing rows. Rule 3 is dropped.
4. (Raised while designing) Charts: **Answer:** shadcn `chart` (recharts) for the pain line; the
   heatmap is a plain token-coloured grid.

## Decisions made during implementation

(Fill in while building.)
