# 13 · Session logging and dashboard

- **Status:** Done
- **Feature:** D (adherence + pain logging)
- **Depends on:** 10 (integrates with 12 if present)

## Summary

Patients mark a routine as done for a day, rate their pain 0–10 and leave an optional comment,
straight from their link. Physios see adherence and pain trends per customer and a dashboard
of who needs attention. This is what makes the app better than sending a PDF.

## Goals

- Patient: "Mark as done" per routine per day (plan entry or single routine), pain slider,
  comment; edit today's log (today only since 2026-10-10, see Decisions).
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

- [x] Patient can log/edit today's session with pain and comment; state persists (yesterday
      dropped on 2026-10-10).
- [x] Cross-customer and unreachable-routine writes rejected (integration tests).
- [x] Activity tab heatmap, pain chart and comments feed; comments marked seen.
- [x] Dashboard "Needs attention" rules implemented and unit-tested; links to customers.
- [x] Workout finish screen (spec 12) opens the log sheet when both specs are done.

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

- **`session_logs.weekly_plan_entry_id` has no FK** (deviation). `ON DELETE SET NULL` could collide
  with the `NULLS NOT DISTINCT` unique key (the same routine logged on its own that day) and make
  deleting a plan entry fail. The id is validated against the link at write time; a deleted
  entry just leaves it dangling. The `share_link_id` FK is a composite `ON DELETE SET NULL
(share_link_id)` (needs `share_links_physio_id_id_unique`, added in the custom migration).
- **`updated_at` means "the patient changed it".** The trigger only fires when `completed`, `pain`,
  `comment` or `performed_on` change, so deleting a link or the physio marking a comment as seen
  does not move a customer up "Recently active".
- **Date comes from the page, not the device.** `performed_on` is computed from the physio's time
  zone (spec 10: that is the patient's "today") and the server accepts only today in it, so there
  is no device-clock skew to tolerate (deviation from "patient's local date").
- **Today only (2026-10-10, supersedes "today or yesterday").** A patient logs the day they do the
  session; another day is another session, so there is no logging after the fact and no
  "Today / Yesterday" picker. `isLoggableDate` is `date === today` and the server rejects any
  other day with `date`. Logs already saved for yesterday stay, read-only.
- **Which day a card logs.** A plan day of the week strip stands for its date in the current
  Monday-Sunday week (`dateForWeekday`); only today's can be logged. Single routines log today.
  Other days show their state (Done) but cannot be edited.
- **Reachability** is `isReachable` (`src/server/patient/view.ts`), the predicate behind the
  workout route generalised to a date and an optional plan entry, so the page, the workout and
  logging answer "can this link reach it?" the same way. A routine link never carries an entry; an
  entry must hold exactly that routine in an active plan of the link's customer. A made-up
  `?entry=` on the workout URL is dropped (the log is then saved for the routine alone).
- **Undo.** Saving with `completed = false` is the "Mark as not done" action; pain and comment are
  kept. Only completed logs count towards adherence, the heatmap and "sessions this week".
- **The signed-in physio previewing a link never writes**: the action refuses (`preview`) and the
  cards show no button, only a "Done" state.
- **Heatmap cells** compare what was planned that day (plan entries) with the logs made from a
  plan entry; a standalone routine logged the same day neither completes nor hides a missed entry
  (it only makes a day "extra" when nothing was planned). Adherence over a window is the combined
  ratio, so singles' sessions and plan entries share one pool.
- **Undone sessions are not activity**: `completed = false` logs do not date "last logged" or put
  a customer under "Recently active" (their pain still feeds the attention rules).
- **Adherence** (`src/lib/adherence.ts`): planned = plan entries per active weekday (`isActiveOn`
  on the plan, so phase windows apply) + each standalone routine's `sessions_per_week / 7` per
  active day (only `sessions_per_day` set means daily; neither set means nothing planned, its logs
  show as "extra"). `sessions_per_day` does not multiply, since a patient leaves one log per
  routine per day. Adherence is a window ratio (doing Friday's routine on Wednesday still
  counts), capped at 1. Planned sessions come from plans and routines **as they are now**, so
  editing a plan rewrites how its past weeks read (known limitation); archived or draft items
  drop out of history.
- **Attention rules** (`src/lib/attention.ts`, thresholds in `ATTENTION`): pain >= 7 in the last 7
  days (today included); average pain up >= 3 on the 7 days before, only when both weeks have a
  rating; adherence < 50 % over the 7 days that **ended yesterday** (so today's unfinished session
  is not held against them), only when something was planned and the customer still has a live
  link (otherwise they could not have logged).
- **Rate limiting dropped** (answer to Q3): the upsert already caps rows.
- **Activity tab is a read.** Comments are marked seen by `MarkCommentsSeen` (a client effect
  calling `markCommentsSeenAction` with the ids of the unseen comments it showed) after the tab
  rendered them, so the "New" badges show once, a comment that arrives meanwhile stays new, and
  the dashboard's "New comments" card refreshes via `revalidatePath("/dashboard")`. A
  revalidating server action also re-renders the page it was called from, so the tab comes
  back with those comments seen; `CommentsFeed` (a client component) remembers which ones it
  showed as new and keeps their badges for the rest of the visit. The feed
  is the 50 newest comments of all time, not limited to the 12 weeks of the heatmap.
- **Charts.** The pain line is recharts through a hand-written `src/components/ui/chart.tsx`
  (the shadcn registry was unreachable; same API for `ChartContainer`/`ChartTooltip`, reduced to
  what is used). It uses the `primary` token, a dashed `destructive` line at the attention
  threshold, a `role="img"` summary and a screen-reader table with every point. The 12-week
  heatmap is plain markup (`ActivityHeatmap`): one named square per day, tokens only, a legend.
  recharts is only imported by the Activity tab's client component.
- **Dashboard** is computed in one pass (`getDashboard`: customers, 14 days of logs, unseen
  comments aggregated per customer in SQL, live links, plans) and reduced by the pure
  `buildDashboard`; "Recently active" lists
  customers with a log in the last 7 days by latest `updated_at` (max 8), "New comments" the
  newest unseen comment per customer. Archived customers are excluded everywhere.
- **`TabEmpty` removed** (the Activity tab was its last user) with `Customers.tabEmpty`.
- **The log sheet submits from controlled state**, not a form `action`: React 19 resets a form
  after its action, which dropped the pain rating (and a typed comment) on a retry after a failed
  save. Convention deviation (`useActionState` forms) noted for that reason.
- **Pain control** is a custom widget on native radios (two rows of 0-10, tint from the
  `destructive` token), not a shadcn control; the day toggle in the sheet is the same pattern.
- **Verification environment.** No Docker daemon here, so integration and e2e ran against a local
  Postgres 16 with stubbed `auth`/`storage` schemas and a small fake GoTrue (create/delete user,
  magic link, verify, user). CI runs the suites that need real Supabase.
