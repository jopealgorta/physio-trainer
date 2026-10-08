# Routine sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Routines are organised into 1–12 named sections; the physio creates them inline in the
editor and drags exercises between them; patient page, exports and history show them.

**Architecture:** New `routine_sections` table plus nullable `routine_items.section_id`
(expand/contract) with a backfill. The editor state becomes `EditorSection[]` (each holding the
existing `EditorBlock[]`), so the spec 05 block helpers stay unchanged and are applied per
section. Readers group items into sections, with a fallback for null `section_id`.

**Tech Stack:** Next.js 16, Drizzle, Supabase Postgres, dnd-kit, next-intl, Vitest, Playwright.

**Spec:** `docs/specs/22-routine-sections.md` (read it and `docs/architecture.md` first).

## Global Constraints

- `MAX_SECTIONS = 12`, `SECTION_NAME_MAX = 60` (in `src/lib/routines.ts`, no `@/` imports there).
- Every string in `messages/en.json` and `messages/es.json` (Rioplatense voseo).
- Suggestion chips: en "Warm-up", "Mobility (ROM)", "Main", "Cool-down"; es "Entrada en calor",
  "Movilidad (ROM)", "Principal", "Vuelta a la calma". Default section name: en "Main", es
  "Principal".
- Tenancy: `routine_sections` has `physio_id`, RLS `ownRows`, composite FKs, `set_updated_at`.
- `routine_items.section_id` stays **nullable**; never write null from new code.
- Item `position` remains flat across the routine (sections in order, then blocks in order).
- Patient page / PDF show section headings only when 2+ non-empty sections exist; empty sections
  are skipped everywhere patient-facing.
- No hand-rolled controls (shadcn `Input`, `Button`, `DropdownMenu`, `AlertDialog`), accent on
  `primary`, Node via `nvm use 24` before `pnpm`.

## Typecheck between tasks

The save payload changes shape in Task 2, so `pnpm typecheck` stays red in files owned by later
tasks until Task 8. Each task runs its own tests (Vitest doesn't typecheck); Task 8 ends with
`pnpm check` fully green, and no task may leave errors in files it owns.

## Review Focus

1. A routine saved by the previous app version (items with null `section_id`, or no sections at
   all) must still load in the editor, patient page, exports and history — never crash or drop
   items (Task 4, 6 int tests).
2. Deleting the section that holds a superset, or moving a superset across sections, must keep
   the superset intact and never leave a group spanning two sections (Task 1 unit tests).
3. The 50-item limit is total across sections, not per section (duplicate/add disabled at 50
   total) (Task 1, Task 8).
4. Old history snapshots (no `sections`) diff against new ones without listing every item as
   "section changed" (Task 5).
5. A whitespace-only or 61-char section name is rejected client-side and server-side (Task 2).

---

### Task 1: Section editor state (pure)

**Files:**

- Modify: `src/lib/routines.ts` (add `MAX_SECTIONS`, `SECTION_NAME_MAX`)
- Create: `src/lib/routine-sections.ts`, `src/lib/routine-sections.test.ts`
- Modify: `src/lib/routine-editor.ts` (`fromLoaded`/`toSaveBlocks` section-aware), its test

**Interfaces (produces):**

```ts
// routine-sections.ts
export type EditorSection = { key: string; name: string; blocks: EditorBlock[] };
export type SaveSection = { key: string; name: string };
export function newSection(name: string, newKey: NewKey): EditorSection;
export function allBlocks(sections: EditorSection[]): EditorBlock[];
export function totalItems(sections: EditorSection[]): number;
export function canAddSection(sections: EditorSection[]): boolean; // < MAX_SECTIONS
export function addSection(sections, name: string, newKey): EditorSection[]; // trimmed, 1..SECTION_NAME_MAX, else same array
export function renameSection(sections, key: string, name: string): EditorSection[]; // invalid name → same array
export function removeSection(sections, key: string): EditorSection[]; // only section → same array
export function moveSection(sections, key: string, delta: -1 | 1): EditorSection[];
export function reorderSections(sections, ordered: EditorSection[]): EditorSection[]; // same members only
export function updateSectionBlocks(
  sections,
  key: string,
  fn: (b: EditorBlock[]) => EditorBlock[],
): EditorSection[];
export function sectionKeyOfBlock(sections, blockKey: string): string | null;
export function moveBlockToSection(
  sections,
  blockKey: string,
  toKey: string,
  index?: number,
): EditorSection[]; // append when index undefined
export function addItemToLast(sections, item: EditorItem): EditorSection[]; // respects total MAX_ITEMS
export function duplicateItemIn(sections, itemKey: string, newKey): EditorSection[]; // total MAX_ITEMS
export function toSaveSections(sections): SaveBlocks & { sections: SaveSection[] };
export function fromLoadedSections(
  items: LoadedItem[],
  groups: LoadedGroup[],
  sections: LoadedSection[],
  defaultName: string,
  newKey,
): EditorSection[];
export type LoadedSection = { id: string; name: string };
// Patient/export helpers (generic):
export function flattenSections<B>(sections: { blocks: B[] }[]): B[];
export function visibleSections<S extends { blocks: unknown[] }>(
  sections: S[],
): { sections: S[]; headings: boolean };
```

`SaveItem` (routine-editor.ts) gains `sectionKey: string`; `LoadedItem` gains `sectionId: string | null`.

- [ ] **Step 1: Failing tests** in `routine-sections.test.ts`:
  - `addSection` trims, rejects `"  "` and 61 chars, stops at 12; `removeSection` refuses the
    only section and drops a section's blocks; `moveSection`/`reorderSections` order.
  - `moveBlockToSection` moves a superset block whole (members and rest preserved) and a single
    to index 0 of another section; unknown keys → same array.
  - `addItemToLast` appends to the last section and is a no-op at 50 items total spread over
    two sections; `duplicateItemIn` likewise.
  - `toSaveSections`: items listed section by section, each with its `sectionKey`; groups keep keys.
  - `fromLoadedSections`: items with `sectionId: null` join the first section; no sections →
    one section named `defaultName`; empty loaded sections kept; group runs never cross a section
    boundary (a group id split by sections becomes separate blocks/singles per spec 05 rules).
  - `visibleSections`: drops empty sections; `headings` true only with ≥2 non-empty.
- [ ] **Step 2:** `pnpm test src/lib/routine-sections.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement; reuse `fromLoaded` per section (bucket loaded items by section, call
      existing `fromLoaded` on each bucket), `toSaveBlocks` per section adding `sectionKey`.
- [ ] **Step 4:** `pnpm test src/lib` → PASS (update `routine-editor.test.ts` for `sectionKey` only
      if `toSaveBlocks` signature changes; keep `toSaveBlocks(blocks)` usable per section).
- [ ] **Step 5:** Commit `feat(routines): section editor state helpers`.

### Task 2: Save validation

**Files:** Modify `src/lib/routine-structure.ts` (+test), `src/server/routines/schemas.ts`
(+`schemas.test.ts`).

**Interfaces:** `validateStructure(groups, items, sections?: { key: string }[])` where
`StructureItem` gains `sectionKey: string`; new issues `"unknownSection" | "duplicateSection" |
"sectionOrder" | "groupSpansSections"`. `saveRoutineSchema` gains
`sections: z.array({ key: z.string().min(1).max(64), name: trimmed 1..SECTION_NAME_MAX }).min(1).max(MAX_SECTIONS)`
and `saveItemSchema.sectionKey`. `SaveRoutineInput` gains `sections: SaveSection[]`.

- [ ] **Step 1: Failing tests:** schema rejects 0 sections, 13 sections, name `"   "` and 61
      chars, an item with an unknown `sectionKey`, items out of section order (item of section 2
      before an item of section 1), a group whose members are in different sections; accepts
      empty sections and trims names.
- [ ] **Step 2:** run `pnpm test src/server/routines/schemas.test.ts src/lib/routine-structure.test.ts` → FAIL.
- [ ] **Step 3:** Implement. "sectionOrder": the section index of items must be non-decreasing.
- [ ] **Step 4:** tests PASS. `pnpm typecheck` may now fail only in files later tasks own
      (`mutations.ts` → Task 4, `history/restore.ts` → Task 5, `routine-editor.tsx` → Task 8).
- [ ] **Step 5:** Commit `feat(routines): validate sections on save`.

### Task 3: Database

**Files:** Modify `src/db/schema/routines.ts`; generate migrations; Modify
`src/test/int/content.ts` (`insertRoutine` creates one "Main" section and sets `sectionId`;
`FixtureItem.section?: string` names extra sections); Create
`src/server/routines/sections.int.test.ts`.

- [ ] **Step 1:** Add `routineSections` table per spec (unique `routine_sections_physio_routine_id_unique`
      on `(physioId, routineId, id)`, unique `routine_sections_position_unique`, checks
      `routine_sections_position` `>= 0`, `routine_sections_name_length` `1..SECTION_NAME_MAX`, index,
      `ownRows("routine_sections_own")`); `routineItems.sectionId uuid()` + FK
      `routine_items_section_fk` `(physioId, routineId, sectionId)` → sections (no on delete).
      Export `RoutineSection` type.
- [ ] **Step 2:** `pnpm db:generate --name routine-sections`, then
      `pnpm drizzle-kit generate --custom --name routine-sections-extras` containing the
      `routine_sections_set_updated_at` trigger and the backfill:
  ```sql
  insert into public.routine_sections (physio_id, routine_id, name, position)
  select r.physio_id, r.id, case when p.locale = 'es' then 'Principal' else 'Main' end, 0
  from public.routines r join public.physios p on p.id = r.physio_id;
  update public.routine_items i set section_id = s.id
  from public.routine_sections s
  where s.physio_id = i.physio_id and s.routine_id = i.routine_id and i.section_id is null;
  ```
- [ ] **Step 3:** `pnpm db:reset`; int tests: RLS (physio B can't select/insert/update/delete A's
      sections), FK rejects an item pointing at another routine's section, the shared "every table has
      RLS + updated_at trigger" test passes. Backfill: covered by applying the migration on a DB
      with data is impractical; instead assert in a int test that `insertRoutine` fixture shape
      matches (documented decision).
- [ ] **Step 4:** `pnpm test:int src/server/routines` PASS.
- [ ] **Step 5:** Commit `feat(db): routine_sections table and backfill`.

### Task 4: Routine server code

**Files:** Modify `src/server/routines/mutations.ts` (`saveRoutine`, `copyRoutine`),
`src/server/routines/queries.ts` (`getRoutine`), `routines.int.test.ts`.

**Interfaces:** `getRoutine` result gains `sections: LoadedSection[]` (ordered by position) and
item `sectionId`. `saveRoutine` takes `SaveRoutineInput` with `sections`.

- [ ] **Step 1: Failing int tests:** save with three sections (one empty) and reload → names,
      order, item sections, empty section kept; second save replaces sections (fresh ids, old rows
      gone); copy (template → routine and `duplicateRoutine`) keeps section names/order and item
      membership; legacy: an item with `section_id` null (insert via owner db) loads into the first
      section via `getRoutine` + `fromLoadedSections`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** saveRoutine: delete items → groups → sections; insert sections (positions by
      array index) → groups → items (`sectionId` from key map). copyRoutine: copy sections first,
      map ids, set item `sectionId` (null stays null).
- [ ] **Step 4:** `pnpm test:int src/server/routines` PASS.
- [ ] **Step 5:** Commit `feat(routines): save, load and copy sections`.

### Task 5: History

**Files:** `src/lib/history/snapshot.ts`, `restore.ts`, `diff.ts` (+tests),
`src/server/history/record.ts`, `src/server/history/mutations.ts`,
`src/components/history/summary-text.tsx` (field labels), messages.

**Interfaces:** snapshot gains `sections: z.array({key, name}).default([])` and
`prescription.sectionKey: z.string().nullable().default(null)` (additive like `distanceMeters`;
keys `s0, s1…`). `routineRestoreInput(snapshot, current, existing, defaultSectionName: string)`.
Diff: header change `{ field: "sections", from: "Warm-up, Main", to: "Warm-up, Main, Cool-down" }`
when ordered names differ; item change `{ field: "section", from: name, to: name }`. Both only
when **both** snapshots have sections (stored jsonb isn't re-parsed: treat `undefined` as `[]`).

- [ ] **Step 1: Failing tests:** record builds sections/keys; restore of an old snapshot → one
      section named `defaultSectionName` holding all items; restore of a new one keeps sections and
      item membership (dropped exercises don't drop sections); diff old→new reports no section
      changes; rename/add a section → one `sections` header change; moving an item → `section`
      change and summary `fields.section = 1`; labels "Sections"/"Section" render.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** Implement; `history/mutations.ts` passes the translated default name
      (`getTranslations({ locale, namespace: "Routines.sections" })("defaultName")` with the
      physio's locale as other server code does).
- [ ] **Step 4:** `pnpm test src/lib/history src/components/history` and `pnpm test:int src/server/history` PASS.
- [ ] **Step 5:** Commit `feat(history): sections in routine snapshots`.

### Task 6: Content loader and patient page

**Files:** `src/server/routines/content.ts`, `src/server/patient/view.ts` (types),
`src/components/patient/exercise-list.tsx`, `routine-view.tsx`, `session-summary-data.ts`,
`src/app/(patient)/[handle]/[slug]/workout/[routineId]/page.tsx`,
`src/components/patient/workout/workout-player.tsx` (+tests).

**Interfaces:** `ContentSection = { key: string; name: string; blocks: ContentBlock[] }`;
`RoutineContent.blocks` is replaced by `sections: ContentSection[]` (non-empty and empty, in
order; the implicit section has `name: ""`). `PatientSection = ContentSection`.
`ExerciseList` takes `sections: PatientSection[]` instead of `blocks`; numbering continues across
sections; headings (`h3`, inside the `ol` as an `li` with `role="presentation"` or as section
wrappers—keep `ol` semantics valid) shown per `visibleSections`.

- [ ] **Step 1: Failing tests:** content int test — sections ordered, empty kept, null
      `section_id` items in first section; `ExerciseList` test — two non-empty sections render both
      names and numbering 1,2,3 across them; one non-empty (plus an empty one) renders no heading.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** Implement; workout and session summary use `flattenSections(routine.sections)`.
- [ ] **Step 4:** `pnpm test src/components/patient` + `pnpm test:int src/server/patient src/server/routines` PASS.
- [ ] **Step 5:** Commit `feat(patient): section headings on the patient page`.

### Task 7: Exports

**Files:** `src/server/export/model.ts`, `pdf/document.tsx`, `xlsx.ts` (+tests), messages
(`Export.xlsx.columns.section`).

**Interfaces:** `ExportRoutine.blocks` → `sections: { name: string; blocks: ExportBlock[] }[]`
(empty ones removed) and `sectionHeadings: boolean`. Superset letters continue across sections.
PDF `Row` gains `{ kind: "heading"; name }` rendered with the existing caption style, kept with
the next exercise (`wrap={false}` group). Excel adds a "Section" column after the label column.

- [ ] **Step 1: Failing tests:** model — empty sections dropped, letters A,B across sections,
      `sectionHeadings` rule; xlsx — header has "Section", each row carries its section name; PDF
      render smoke test contains the section names when 2+.
- [ ] **Step 2–4:** run FAIL → implement → `pnpm test src/server/export` PASS.
- [ ] **Step 5:** Commit `feat(export): sections in PDF and Excel`.

### Task 8: Editor UI

**Files:** Create `src/components/routines/section-list.tsx` (DnD + section cards),
`section-card.tsx`, `add-section.tsx` (+tests); Modify `routine-editor.tsx`, `block-list.tsx`
(becomes the per-section block renderer without its own `DndContext`), `item-row.tsx`,
`group-card.tsx`, `src/app/(app)/routines/[routineId]/page.tsx`, messages
(`Routines.sections.*`), `routine-editor.test.tsx`, `block-list.test.tsx`.

**Behaviour:**

- `RoutineEditor` state `sections: EditorSection[]` (`initialSections` prop from
  `fromLoadedSections(routine.items, routine.groups, routine.sections, t("defaultName"), uuid)`);
  snapshot/save use `toSaveSections`; picker uses `addItemToLast`; invalid/expanded logic uses
  `allBlocks`.
- One `DndContext` in `SectionList`: sections sortable by their handle (ids `section:<key>`),
  each section a `SortableContext` of block keys + a droppable for empty sections; `onDragOver`
  moves a block across sections (`moveBlockToSection`), `onDragEnd` reorders within. Superset
  members keep their nested `SortableList`. Announcements reuse `Sortable` messages.
- Section card: `DragHandle`, name shown as text with a pencil → `Input` (Enter/blur confirms,
  Escape cancels, invalid → error, keeps old), `DropdownMenu` (Rename, Move up, Move down,
  Delete — disabled when only one). Delete with exercises → `AlertDialog` ("Delete “{name}” and
  its {count, plural…} exercises?"). Empty section: dashed "Drag exercises here" box.
- `AddSection`: `Input` + "Add section" button + chip `Button`s (variant outline, size sm);
  disabled at 12 with a limit message.
- Item/group menu: "Move to section" `DropdownMenuSub` listing other sections (hidden when only
  one section). `ItemRow`/`GroupCard` receive `canAddItem: boolean` (total-based) instead of
  computing from their section's blocks.
- [ ] **Step 1: Failing component tests:** new routine shows one "Main" section; add via chip
      "Cool-down" and via typed name; rename (Enter) and Escape cancel; delete non-empty asks for
      confirmation and removes exercises; delete disabled with one section; "Move to section" moves
      an exercise and the save payload has the new `sectionKey`; picker adds to the last section;
      keyboard reorder of sections (space, arrow down, space) changes order.
- [ ] **Step 2–4:** FAIL → implement → `pnpm test src/components/routines` PASS, `pnpm check` PASS.
- [ ] **Step 5:** Commit `feat(routines): sections in the routine editor`.

### Task 9: E2E and docs

**Files:** Create `e2e/routine-sections.spec.ts`; fix existing e2e that break
(`routines.spec.ts`, `routine-editor.spec.ts`, `templates.spec.ts`, `history.spec.ts`,
`patient-v2.spec.ts`, `export.spec.ts`); Modify `docs/architecture.md` (ER diagram + table
row for `routine_sections`), `docs/specs/22-routine-sections.md` (Status Done, acceptance
checkboxes, decisions), `docs/specs/README.md` (Done).

- [ ] **Step 1:** E2E: open a routine, add "Warm-up" chip section, add two exercises (land in
      last section), move one to "Main"… via the menu, keyboard-reorder sections, save, reload →
      layout kept; open the patient preview/share page → both headings visible in order.
- [ ] **Step 2:** `pnpm test:e2e e2e/routine-sections.spec.ts` (+ the touched specs) PASS on desktop
      and mobile projects.
- [ ] **Step 3:** Docs updated; commit `test(e2e): routine sections; docs`.
