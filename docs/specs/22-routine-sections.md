# 22 · Routine sections

- **Status:** In progress
- **Feature:** Core (extends 05)
- **Depends on:** 05, 07, 08, 10, 14, 15, 19

## Summary

A routine's exercises are organised into named **sections** ("Warm-up", "Mobility (ROM)",
"Main", "Cool-down"), so the patient knows what each part of the session is for. The physio
creates sections inline in the routine editor and moves exercises between them by drag and
drop. Every routine has at least one section.

## Goals

- Every routine (and template) has 1–12 ordered, named sections; every exercise belongs to one.
- Create a section inline with a free-text name or a localized suggestion chip; rename, reorder,
  delete sections.
- Drag an exercise (or a whole superset) within a section or into another section; a keyboard
  and touch fallback ("Move to section") in the block menu.
- The patient page, PDF and Excel export show the sections.
- History snapshots, diffs and restores include sections; copies (templates, phases, plan
  copies) keep them.

## Non-goals

- A note per section (decided against, 2026-10-08; routine and item notes cover it).
- A library of reusable section presets per physio.
- Showing sections in workout mode (spec 12, hidden): it flattens them.
- Choosing which section the picker adds to: it always appends to the last section.

## User stories

- As a physio, I add "Warm-up", "Main" and "Cool-down" sections to Ana's routine and drag each
  exercise into the right one.
- As a patient, I see my exercises under "Warm-up", "Main" and "Cool-down" headings, so I know
  which part I'm doing.

## Data model

`routine_sections` (new):

| Column                                                | Type             | Notes                       |
| ----------------------------------------------------- | ---------------- | --------------------------- |
| `id`, `physio_id`, `routine_id` (cascade), timestamps |                  | composite FK to `routines`  |
| `name`                                                | text not null    | 1–60 characters, trimmed    |
| `position`                                            | integer not null | 0-based, unique per routine |

Constraints: unique `(physio_id, routine_id, id)` (target of the items FK), unique
`(physio_id, routine_id, position)`, `position >= 0`, name length check. RLS (`ownRows`), the
`set_updated_at` trigger, index `(physio_id, routine_id)`.

`routine_items` gains `section_id uuid`, composite FK `(physio_id, routine_id, section_id)` →
`routine_sections (physio_id, routine_id, id)` (no `ON DELETE` action: the save deletes items
before sections; the routine cascade deletes both).

**Expand, then contract.** `section_id` is nullable in this spec: during a deploy the previous
app version can still save a routine without sections. A follow-up chore PR sets it `NOT NULL`
once no deployed code writes nulls. Until then readers apply rule 3 below.

**Backfill** (custom migration): every existing routine (templates included) gets one section at
position 0, named "Principal" when its physio's `locale` is `es`, "Main" otherwise, and every
item of the routine points at it.

Item `position` stays flat across the routine (section order, then block order), so code that
orders by position alone keeps working.

## Routes and UI

No new routes. The routine editor (`/routines/[routineId]`, also templates) changes:

- The block list becomes a list of **section cards**. Each card: drag handle (reorders sections),
  the name edited inline, a "⋯" menu (rename, move up, move down, delete), its blocks, and an
  empty-state drop zone ("Drag exercises here").
- Blocks (a single exercise or a whole superset) drag within a section or across sections (one
  dnd-kit context, one sortable container per section). Superset members still reorder only
  inside their card. A block's menu gains "Move to section ▸ <name>" (keyboard/touch fallback).
- "Add section" below the last section: an inline name input plus suggestion chips (Warm-up,
  Mobility (ROM), Main, Cool-down; localized). Enter or a chip creates the section at the end.
- The picker appends new exercises to the last section.
- A routine with no sections (new, or empty) opens with one section named "Main" (localized);
  it is saved with the routine.

Patient page (spec 19 list), PDF and Excel:

- Patient page and PDF: a heading per non-empty section, exercise numbering continuous across
  sections. Headings show only when the routine has **two or more non-empty sections**, so a
  routine with a single section reads as before.
- Excel: a "Section" column on each exercise row.

## Behaviour and rules

1. A routine has 1–12 sections (`MAX_SECTIONS`); names 1–60 characters after trimming
   (`SECTION_NAME_MAX`). Duplicate names are allowed.
2. Every saved item references a section of its routine; all members of a superset are in the
   same section and consecutive. "Group with next" only joins blocks of the same section.
3. Reading (editor, patient page, exports, snapshots): an item whose `section_id` is null joins
   the first section; a routine with items but no sections reads as one section named by the
   reader's default ("Main", localized). Never errors.
4. Empty sections are saved; the patient page and exports skip them.
5. Deleting a section with exercises asks for confirmation and removes its exercises. The only
   section can't be deleted (the menu item is disabled).
6. Saving replaces sections with the rest of the routine (fresh ids, spec 05), in one
   transaction; delete order items → groups → sections, insert order sections → groups → items.
7. Copies (template ↔ routine, copy into next phase, plan "separate copy") copy sections and
   each item's section.
8. History: the snapshot schema gains `sections` (`key`, `name`) and an item `sectionKey`; older
   snapshots read as one default section. The diff reports sections added, removed, renamed and
   exercises moved between sections; restore recreates the sections.

## Security and privacy

- `routine_sections` follows the tenancy rules (physio_id, RLS, composite FKs). Section names are
  physio-typed text shown on the patient page; never used in URLs or link previews.
- The save action validates section keys server-side; a crafted payload can't point an item at
  another routine's section (composite FK).

## i18n

`Routines.sections.*` (add, name label, chips, menu, move to, delete confirmation, drop zone,
default name), `Patient` section heading labels where needed, `Export` (`xlsx.columns.section`),
history diff lines. Every key in `en` and `es` (Rioplatense voseo). Suggestion chips: en
"Warm-up", "Mobility (ROM)", "Main", "Cool-down"; es "Entrada en calor", "Movilidad (ROM)",
"Principal", "Vuelta a la calma".

## Acceptance criteria

- [ ] Migration creates `routine_sections`, `routine_items.section_id`, and backfills one section
      per routine with the physio's locale name.
- [ ] Editor: add (input + chips), rename, reorder, delete (confirm, not the last) sections;
      move blocks between sections by drag and by the menu; supersets never span sections.
- [ ] Save/reload keeps sections and their order; validation rules 1–2 enforced server-side.
- [ ] Rule 3 fallback for null `section_id` and section-less routines.
- [ ] Patient page and PDF show headings (2+ non-empty sections rule); Excel has a Section column.
- [ ] History snapshot/diff/restore include sections; old snapshots still restore.
- [ ] Copies keep sections.
- [ ] RLS tests for `routine_sections`.

## Test plan

- Unit: section helpers (`src/lib/routine-sections.ts`), `fromLoaded`/`toSaveBlocks` round trip,
  zod rules, snapshot/diff/restore, content grouping, patient list headings, export model.
- Integration (incl. RLS): save with sections, cross-routine section rejected, backfill, legacy
  null `section_id` read, copies keep sections, RLS on `routine_sections`.
- E2E: add a section with a chip, add exercises, move one between sections (menu and keyboard
  drag), save, reload; patient page shows the headings.

## Open questions

1. Optional or required? **Answer (2026-10-08):** always required; existing routines get a
   default section ("Main") by data migration.
2. How is a section named? **Answer:** free text plus localized suggestion chips (Warm-up,
   Mobility (ROM), Main, Cool-down).
3. A note per section? **Answer:** no, name only.
4. Where does the picker add an exercise? **Answer:** always at the end (last section); drag to
   move.

## Decisions made during implementation

(Fill in while building.)
