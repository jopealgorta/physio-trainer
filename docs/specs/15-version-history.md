# 15 · Version history

- **Status:** Done
- **Feature:** I (routine version history)
- **Depends on:** 05, 06

## Summary

Every save of a routine or weekly plan stores a snapshot. The patient always sees the latest
version; the physio can see what changed and when, compare versions, and restore an older one.
This supports clinical record-keeping ("what was Ana doing in March?").

## Goals

- Snapshot on every save (routine editor save, plan board changes).
- History panel: list of versions (date, time, summary like "+2 exercises, reps changed on 1").
- Diff view between any version and the current one.
- Restore a version (creates a new version; history is append-only).

## Non-goals

- Tracking library exercise edits (the snapshot stores the exercise name/instructions at save
  time, which is what matters clinically).
- Per-field audit log of every table.

## Data model

`routine_versions`:

| Column                          | Type                               | Notes                                                                                                                                                                                             |
| ------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `physio_id`, `created_at` |                                    | append-only (no update/delete policies)                                                                                                                                                           |
| `routine_id`                    | uuid not null → routines (cascade) |                                                                                                                                                                                                   |
| `version`                       | integer not null                   | matches `routines.version` after the save; unique with `routine_id`                                                                                                                               |
| `snapshot`                      | jsonb not null                     | versioned shape `{ schema: 1, routine: {...}, items: [{ exercise: { id, name, instructions }, prescription, position }] }` (`prescription` = per-set rows + per-item fields + group, see spec 05) |
| `summary`                       | text null                          | generated change summary                                                                                                                                                                          |

`weekly_plan_versions`: same shape with `{ plan, entries: [{ weekday, position, label, routine: { id, name, version } }] }`.

Snapshot types and a zod schema live in `src/server/history/snapshot.ts`; a `schema` number
allows future migrations of the shape.

## Behaviour and rules

1. Snapshots are written in the **same transaction** as the save (routine save action from
   spec 05; each plan board action from spec 06). Retro-fit both call sites.
2. Plan board changes are frequent: coalesce plan snapshots when the previous snapshot is
   < 5 minutes old and by the same session (update the latest instead of inserting). Routine
   saves always insert.
3. Diff (`src/lib/history/diff.ts`, pure): items added/removed/moved/changed (field-level for
   prescription: per set since spec 05, so "reps changed on set 2"; group membership too), header
   changes (name, notes, status, dates). Used both for `summary` and the
   diff view.
4. Restore = load snapshot → write it as the current state via the normal save path (validates
   that referenced exercises still exist; archived ones are fine; deleted ones are dropped with
   a warning).
5. Retention: keep all versions (small JSON). Revisit if size becomes an issue.

## Routes and UI

- Routine editor and plan board: "History" button → side sheet with the version list; select
  a version → diff view (added in green, removed in red, changed fields with old → new); "Restore
  this version".
- Customer Activity tab (spec 13) may show "Routine updated" events from versions (optional).

## Security and privacy

- Tenancy rules apply; insert-only RLS (select + insert policies for the owner).

## i18n

Namespace `History`.

## Acceptance criteria

- [x] Every routine save and plan change creates (or coalesces) a snapshot in the same transaction.
- [x] History list with human-readable summaries; diff between any two versions.
- [x] Restore works and is itself a new version.
- [x] Unit tests for the diff; integration tests for transactional writes and RLS.

## Test plan

- Unit: diff algorithm (add/remove/reorder/change), summary text.
- Integration: failed save rolls back its snapshot; coalescing window.
- E2E: change reps → history shows "reps changed"; restore previous → value back.

## Open questions

Answered 2026-10-02:

1. **Does history start at creation?** Yes. Creating or copying a routine or plan (new, template
   assign/duplicate, save as template, next phase, "separate copy") writes the version 1 snapshot,
   so a copy's starting point is in history and can be restored.
2. **What does restore bring back?** Content only: name, notes, sessions per week/day and the
   groups/items/sets (plan: name, notes and entries). Status, case and the phase window stay as
   they are now, so a restore never unpublishes or re-activates what the patient sees.
3. **Plan restore with an archived routine?** Entries whose routine is now archived are dropped
   with a warning, like deleted routines. The plan's status is unchanged.
4. **"Routine updated" events on the Activity tab?** Not in this spec (follow-up).

## Decisions made during implementation

- `summary` is structured jsonb rendered per locale, not text.
- Snapshot types live in `src/lib/history/snapshot.ts` (the client diff needs them), not under
  `src/server/`. `VERSION_KINDS` lives in alias-free `src/lib/history/kinds.ts`, because
  drizzle-kit loads the schema without the `@/` alias.
- `weekly_plan_versions` has an update policy (for coalescing) plus `session_id` and
  `updated_at`; both tables have `kind` and `restored_from` columns. Entries carry their id.
- Coalescing never folds into created or restored rows. Coalesced plan edits that cancel out
  leave a version whose summary reads "No changes".
- Versions created before this spec are not backfilled; the first recorded version is shown
  without a summary.
- Phase label and dates stay in snapshots and diffs although `setPhase` (schedule metadata,
  spec 08) records no version; a later version's diff then shows the date change.
- Restoring a superset that loses members below the minimum ungroups the survivor and gives it
  the group's rest, as the editor does when a superset shrinks.
- Plan restore re-inserts the snapshot's entries with their snapshot ids: the current entries
  are deleted first in the same transaction and nothing references an entry id, so the ids
  never collide, and a diff across a restore matches entries instead of showing every entry
  removed and re-added. Plan-only routines no longer referenced stay in place, like removing an
  entry without deleting its routine; restoring a plan to before a "separate copy" therefore
  leaves the copy routine in place.
- A plan entry counts as moved when its weekday changed or, on the same day, it falls outside
  the longest run of the day's kept entries that kept their relative order (the same rule
  routine items follow). Positions alone don't count: the board renumbers a day on every add,
  remove or move, so removing the first of three entries moves nothing.
- The plan page's details form adopts restored values when the server's name/notes differ from
  what it last saved (not keyed by version, so board actions don't drop unsaved details
  edits); the plan page shows no unsaved-changes warning in the restore dialog.
- Version activity events on the customer Activity tab are deferred (Open question 4).
