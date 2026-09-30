# 15 · Version history

- **Status:** Not started
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

- [ ] Every routine save and plan change creates (or coalesces) a snapshot in the same transaction.
- [ ] History list with human-readable summaries; diff between any two versions.
- [ ] Restore works and is itself a new version.
- [ ] Unit tests for the diff; integration tests for transactional writes and RLS.

## Test plan

- Unit: diff algorithm (add/remove/reorder/change), summary text.
- Integration: failed save rolls back its snapshot; coalescing window.
- E2E: change reps → history shows "reps changed"; restore previous → value back.

## Open questions

None.

## Decisions made during implementation

(Fill in while building.)
