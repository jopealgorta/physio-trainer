# 03 · Exercise library

- **Status:** Done
- **Feature:** Core
- **Depends on:** 01, 02

## Summary

Each physio has a private library of exercises (rehab and gym alike) with instructions,
default prescription values, YouTube videos and body areas, filed under any number of
categories from a two-level category tree. Routines (spec 05) are built by picking from this library.

## Goals

- Create, edit, archive, restore and delete exercises.
- Categories: top level + one level of sub-categories; create, rename, reorder, delete.
- Media per exercise: add YouTube links (regular videos and Shorts); reorder; first item is
  the cover.
- An exercise belongs to any number of categories (top-level or sub-categories, or none).
- Fast browsing: search by name, filter by category (contains) and body area; grid and list
  views.
- Default prescription (sets, reps, hold, …) copied into routines when the exercise is added.

## Non-goals

- Shared/global exercise catalogue, seed data, CSV import (feature G, deferred).
- Uploaded videos/images and Vimeo links (deferred: media is YouTube-only in v1, see open
  questions). No storage bucket in this spec.

## User stories

- As a physio, I add "Single-leg bridge" with a YouTube Short, cues and default 3 × 12.
- As a physio, I file it under _Lower limb → Glutes_ and _Mobility_; it shows up under both.
- As a physio, I find all knee exercises in my _Mobility_ category in two clicks.

## Data model

`exercise_categories`:

| Column                        | Type                                                     | Notes                                                              |
| ----------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------ |
| `id`, `physio_id`, timestamps |                                                          | per conventions                                                    |
| `parent_id`                   | uuid null → `exercise_categories.id` `on delete cascade` | null = top level                                                   |
| `name`                        | text not null                                            | 1–60 chars, unique per (`physio_id`, `parent_id`) case-insensitive |
| `position`                    | integer not null                                         | order among siblings                                               |

Depth ≤ 2: enforce with a trigger (parent must have `parent_id is null`) and in the zod schema.

`exercises`:

| Column                        | Type                                   | Notes                                                                            |
| ----------------------------- | -------------------------------------- | -------------------------------------------------------------------------------- |
| `id`, `physio_id`, timestamps |                                        |                                                                                  |
| `name`                        | text not null                          | 1–120 chars                                                                      |
| `instructions`                | text null                              | plain text with line breaks; up to 5 000 chars                                   |
| `body_areas`                  | `body_area[]` not null default `{}`    | spec 02                                                                          |
| prescription defaults         | see architecture "Prescription fields" | build the shared Drizzle column helper + zod schema here                         |
| `archived_at`                 | timestamptz null                       | archived exercises are hidden from pickers but keep working in existing routines |

Indexes: `(physio_id, archived_at)`, GIN on `body_areas`, trigram index on `name` (`pg_trgm`)
for search.

`exercise_category_links` (added 2026-10-08, replacing `exercises.category_id` and `tags`):

| Column        | Type                                                      | Notes                                |
| ------------- | --------------------------------------------------------- | ------------------------------------ |
| `physio_id`   | uuid not null → physios `on delete cascade`               | RLS `physio_id = auth.uid()`         |
| `exercise_id` | uuid not null → `exercises` `on delete cascade`           | composite with `physio_id`           |
| `category_id` | uuid not null → `exercise_categories` `on delete cascade` | composite; top-level or sub-category |

Primary key `(exercise_id, category_id)`; index `(physio_id, category_id)`. At most 20
categories per exercise (zod).

`exercise_media`:

| Column                                                 | Type             | Notes                                                        |
| ------------------------------------------------------ | ---------------- | ------------------------------------------------------------ |
| `id`, `physio_id`, `exercise_id` (cascade), timestamps |                  |                                                              |
| `kind`                                                 | enum `youtube`   | append-only; uploads/Vimeo add values in a later spec        |
| `external_url`                                         | text not null    | the URL as pasted (normalised); `/shorts/` ⇒ portrait player |
| `external_id`                                          | text not null    | parsed 11-char YouTube video id                              |
| `position`                                             | integer not null | 0 = cover                                                    |

Cross-row references (`parent_id`, `exercise_id`, `category_id`) are composite foreign keys
including `physio_id`, so a row can never point at another physio's row (foreign-key checks
bypass RLS).

## Routes and UI

| Route                   | Kind          | Purpose                                                                                                                                                                                                               |
| ----------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/library`              | page          | Left: category tree (collapsible, "All", "Uncategorised", "Archived"). Main: search, body-area filter, grid of exercise cards (cover thumbnail, name, area and category badges), toggle to list view. "New exercise". |
| `/library/new`          | page          | Exercise form (including YouTube links).                                                                                                                                                                              |
| `/library/[exerciseId]` | page          | Detail + edit form: name, categories (checklist popover, grouped), instructions, body areas (multi `BodyAreaPicker`), media list. Archive/restore/delete.                                                             |
| Category management     | dialog/inline | Add, rename, drag to reorder, delete (confirm; exercises lose that category).                                                                                                                                         |

- Media list: paste a YouTube URL, reorder by drag, remove. Cover thumbnail from
  `i.ytimg.com`. Preview is click-to-load: the thumbnail is replaced by a privacy-enhanced
  embed that plays inline, muted and looping.
- Empty state for a new physio: explain categories and offer "Create your first exercise".
- Filters and search are reflected in the URL (`?q=&area=&category=&view=`).

## Behaviour and rules

1. Deleting a category with sub-categories deletes the sub-categories; their exercises lose
   those categories and keep any others (confirm dialog shows counts).
2. Exercises cannot be hard-deleted once used in a routine; offer archive. Unused exercises can
   be deleted. (Enforced by spec 05's `routine_items` foreign key; until then every exercise is
   unused.)
3. YouTube URLs accepted: `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/` (also
   `m.` and `www.` hosts). Parse to an id; render with privacy-enhanced embeds
   (`youtube-nocookie.com`).
4. Search matches name (trigram, accent-insensitive via `unaccent`).
5. Filtering by a category shows every exercise whose categories contain it or one of its
   sub-categories; "Uncategorised" shows exercises with no category. The routine exercise
   picker's category filter works the same way.

## Security and privacy

- All tables follow the tenancy rules (physio_id + RLS, `withPhysio`), with composite foreign
  keys so references stay within one physio.
- Thumbnails and embeds are loaded from Google (YouTube) on physio pages. Patient-facing
  rendering is decided in spec 10.

## i18n

Namespace `Library` (+ `Library.categories`, `Library.media`, `Library.form`).

## Acceptance criteria

- [x] CRUD for categories (2 levels max) and exercises; archive/restore.
- [x] YouTube links (videos and Shorts) embed correctly; reorder media.
- [x] Search + filter by category (contains) and body area, reflected in the URL.
- [x] An exercise can have several categories; tags removed (2026-10-08).
- [x] Shared prescription zod schema and Drizzle helper exist and are tested.
- [x] RLS integration tests for all library tables.
- [x] Works on mobile (single column, filters in a sheet).

## Test plan

- Unit: YouTube URL parser, prescription schema, category depth rule, category multi-select.
- Integration: RLS on categories/exercises/media/category links; cross-tenant references
  rejected; delete-category behaviour; contains filter; distinct tree counts; backfill
  migration; accent-insensitive search.
- E2E: create categories + an exercise in two of them with a YouTube Short link; filter by each
  category, a parent, Uncategorised and body area.

## Open questions

1. Do you want thumbnails generated from uploaded videos, or is a manually chosen image enough
   for v1? **Answer (2026-09-28):** no uploads at all in v1 (neither video nor image). Videos
   are YouTube links; the cover is the YouTube thumbnail.
2. Is 100 MB per video right? **Answer:** 50 MB (fits the Supabase Free plan) when uploads
   arrive in a later spec; moot for v1.
3. Which link types? **Answer:** all YouTube forms (`watch?v=`, `youtu.be/`, `shorts/`); Shorts
   render portrait (9:16), others 16:9. No Vimeo.
4. Can links be added on the "New exercise" form? **Answer:** yes; one form for create and edit.
5. One PR or split? **Answer:** one PR.

## Decisions made during implementation

- **Composite FKs everywhere**: every `(physio_id, …)` reference is composite. (Originally
  `exercises` → `categories` was `ON DELETE SET NULL (category_id)`; superseded by
  `exercise_category_links`, below.) Media `position` uniqueness is scoped by `(physio_id, exercise_id, position)` so it
  cannot be used as a cross-tenant existence oracle.
- **Search**: `public.f_unaccent` immutable wrapper plus a trigram GIN index on
  `f_unaccent(lower(name))`. The name matches as a substring; LIKE wildcards are escaped.
- **URL params**: `?q=&category=<uuid>|none|archived&area=&view=grid|list`; results are capped
  at 500. An old `?tag=` is ignored.
- **Media**: YouTube only (watch, youtu.be, shorts; `www.`/`m.` hosts). The canonical URL is
  stored. Shorts are detected from a `/shorts/` URL only (a Short shared as `youtu.be` plays
  16:9). Click-to-load `youtube-nocookie` embed, `i.ytimg.com` thumbnails, at most 10 videos;
  media is replaced wholesale on save.
- **Prescription**: shared zod schema (`src/lib/prescription.ts`) and Drizzle helper
  (`src/db/schema/_prescription.ts`) with DB check constraints. New `Prescription` and
  `Sortable` message namespaces; limits live in `src/lib/library-limits.ts`.
- **Empty states**: the full-width empty library shows only when the physio has no exercises at
  all (archived included), no categories and no filters, so "Archived" stays reachable;
  otherwise empty/no-results render inside the results column.
- **Pending video link**: a valid YouTube URL typed but not added is committed on blur and is
  also submitted as a hidden `media` value, so it is never silently dropped; an invalid one shows
  the error on blur. Empty "Add video" is a no-op. The preview toggle opens the embed directly.
- **500-row cap**: the list fetches 501 rows and shows a "refine your search" hint when truncated.
- Search lower-cases the term in SQL.
- **Exercise form** dispatches from `onSubmit` (no React form reset) and is not re-keyed after
  save, so "Saved" persists and typed values are kept.
- **Delete** is always allowed until spec 05 adds a `routine_items` FK (then "inUse" + archive).
- **E2E found a mobile layout bug**: a long video URL widened the page horizontally (grid
  column sized to content). Fixed with `min-w-0`/`grid-cols-1` on the media rows and sortable
  items; the e2e asserts no horizontal overflow. Real keyboard reorder (categories and videos)
  is covered end to end because unit tests cannot drive dnd-kit.
- **Prescription defaults were removed in spec 05** (UI and code): exercises no longer carry or
  copy a default prescription, and the prescription lives on routine items. The unused database
  columns were dropped afterwards (migration `drop-exercise-prescription-defaults`). Delete now returns `inUse` (and offers archive)
  once a routine item references the exercise.
- **New category from the exercise form** (added 2026-10-02): a "New category" button beside the
  category picker (on new and edit pages) opens a dialog with the name and an optional parent
  ("Inside", top-level categories only, "None" by default) and calls `createCategoryAction`. On
  success the picker adds it locally (`withCategory` in `src/lib/category-tree.ts`, which skips it
  once the revalidated tree already has it) and selects it; the rest of the form keeps its
  values. Errors reuse `Library.categories.errors` (helpers shared in `category-errors.ts`):
  name errors under the name, `notFound`/`tooDeep` under the parent, anything else below both.
  An adjacent button rather than a Select item, which would fight the Select's focus return
  when the dialog opens. The dialog's form calls `stopPropagation()` on submit: it is portalled
  out of the exercise form in the DOM but React still bubbles the submit to it.
- **Several categories per exercise, no tags** (changed 2026-10-08, ad-hoc request): answers to
  the clarifying questions: existing tags are **dropped** (no conversion); the category filter
  stays **single pick with a "contains" match** (tree and routine picker unchanged in look); in
  the form, sub-categories are **independent** of their parent (ticking one does not tick the
  parent: the parent's filter already covers it); cards show **category badges** (tree order,
  "Parent › Sub", two then "+N").
  - Data: `exercise_category_links (physio_id, exercise_id, category_id)` with composite FKs
    cascading from both ends, RLS, PK `(exercise_id, category_id)`. Two migrations: create the
    table; a custom backfill copying each `category_id` into a link (the backfill test runs the
    migration file in a rolled-back transaction).
  - Expand, then contract: `exercises.category_id` and `tags` stay in the database (marked
    `@deprecated` in the Drizzle schema, never read or written by the app) so the previous app
    version keeps working while migrations and the deploy land in either order. A follow-up
    `chore(db)` PR re-runs the backfill (catching categories the old app saved during the
    rollout) and then drops both columns with their FK, index and check.
  - Server: links are replaced wholesale on save in the exercise's savepoint, so a foreign
    category (`exercise_category_links_category_fk`) rolls the whole save back as
    `categoryNotFound`. `ExerciseSummary`/`ExerciseDetail` carry `categoryIds` (sorted by id; the
    UI orders them by the tree). Tree counts are distinct exercises across a category and its
    sub-categories, computed in SQL, so an exercise in a parent and its child counts once
    (`buildCategoryTree` no longer sums). At most 20 categories (`tooManyCategories`).
  - UI: `CategoryMultiSelect` (`Popover` + `Checkbox` list grouped by top-level category, one
    hidden `categoryIds` input per pick; the trigger lists the picks or "Uncategorised"). The
    "New category" dialog ticks what it creates, keeping earlier picks. Deleting a category
    says how many exercises "will lose this category". Tag input, tag filter, `listTags` and
    `src/lib/tags.ts` are gone.
