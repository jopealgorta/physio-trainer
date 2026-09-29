# 03 · Exercise library

- **Status:** Done
- **Feature:** Core
- **Depends on:** 01, 02

## Summary

Each physio has a private library of exercises (rehab and gym alike) with instructions,
default prescription values, YouTube videos, body areas and tags, organised in a two-level
category tree. Routines (spec 05) are built by picking from this library.

## Goals

- Create, edit, archive, restore and delete exercises.
- Categories: top level + one level of sub-categories; create, rename, reorder, delete.
- Media per exercise: add YouTube links (regular videos and Shorts); reorder; first item is
  the cover.
- Fast browsing: search by name, filter by category, body area, tag; grid and list views.
- Default prescription (sets, reps, hold, …) copied into routines when the exercise is added.

## Non-goals

- Shared/global exercise catalogue, seed data, CSV import (feature G, deferred).
- Uploaded videos/images and Vimeo links (deferred: media is YouTube-only in v1, see open
  questions). No storage bucket in this spec.

## User stories

- As a physio, I add "Single-leg bridge" with a YouTube Short, cues and default 3 × 12.
- As a physio, I file it under _Lower limb → Glutes_ and tag it `bodyweight`, `beginner`.
- As a physio, I find all knee exercises that use a band in two clicks.

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

| Column                        | Type                                        | Notes                                                                            |
| ----------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------- |
| `id`, `physio_id`, timestamps |                                             |                                                                                  |
| `category_id`                 | uuid null → categories `on delete set null` | top-level or sub-category                                                        |
| `name`                        | text not null                               | 1–120 chars                                                                      |
| `instructions`                | text null                                   | plain text with line breaks; up to 5 000 chars                                   |
| `body_areas`                  | `body_area[]` not null default `{}`         | spec 02                                                                          |
| `tags`                        | text[] not null default `{}`                | lowercase, trimmed, ≤ 20 tags, ≤ 30 chars each                                   |
| prescription defaults         | see architecture "Prescription fields"      | build the shared Drizzle column helper + zod schema here                         |
| `archived_at`                 | timestamptz null                            | archived exercises are hidden from pickers but keep working in existing routines |

Indexes: `(physio_id, archived_at)`, GIN on `body_areas`, GIN on `tags`, trigram index on `name`
(`pg_trgm`) for search.

`exercise_media`:

| Column                                                 | Type             | Notes                                                        |
| ------------------------------------------------------ | ---------------- | ------------------------------------------------------------ |
| `id`, `physio_id`, `exercise_id` (cascade), timestamps |                  |                                                              |
| `kind`                                                 | enum `youtube`   | append-only; uploads/Vimeo add values in a later spec        |
| `external_url`                                         | text not null    | the URL as pasted (normalised); `/shorts/` ⇒ portrait player |
| `external_id`                                          | text not null    | parsed 11-char YouTube video id                              |
| `position`                                             | integer not null | 0 = cover                                                    |

Cross-row references (`parent_id`, `category_id`, `exercise_id`) are composite foreign keys
including `physio_id`, so a row can never point at another physio's row (foreign-key checks
bypass RLS).

## Routes and UI

| Route                   | Kind          | Purpose                                                                                                                                                                                                           |
| ----------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/library`              | page          | Left: category tree (collapsible, "All", "Uncategorised", "Archived"). Main: search, filters (body area, tags), grid of exercise cards (cover thumbnail, name, area badges), toggle to list view. "New exercise". |
| `/library/new`          | page          | Exercise form (including YouTube links).                                                                                                                                                                          |
| `/library/[exerciseId]` | page          | Detail + edit form: name, category select (grouped), instructions, body areas (multi `BodyAreaPicker`), tags (combobox with existing tags), defaults, media list. Archive/restore/delete.                         |
| Category management     | dialog/inline | Add, rename, drag to reorder, delete (confirm; exercises move to Uncategorised).                                                                                                                                  |

- Media list: paste a YouTube URL, reorder by drag, remove. Cover thumbnail from
  `i.ytimg.com`. Preview is click-to-load: the thumbnail is replaced by a privacy-enhanced
  embed that plays inline, muted and looping.
- Empty state for a new physio: explain categories and offer "Create your first exercise".
- Filters and search are reflected in the URL (`?q=&area=&tag=&category=&view=`).

## Behaviour and rules

1. Deleting a category with sub-categories deletes the sub-categories; their exercises become
   uncategorised (confirm dialog shows counts).
2. Exercises cannot be hard-deleted once used in a routine; offer archive. Unused exercises can
   be deleted. (Enforced by spec 05's `routine_items` foreign key; until then every exercise is
   unused.)
3. YouTube URLs accepted: `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/` (also
   `m.` and `www.` hosts). Parse to an id; render with privacy-enhanced embeds
   (`youtube-nocookie.com`).
4. Search matches name (trigram, accent-insensitive via `unaccent`) and tags.

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
- [x] Search + filter by category, body area and tag, reflected in the URL.
- [x] Shared prescription zod schema and Drizzle helper exist and are tested.
- [x] RLS integration tests for all three tables.
- [x] Works on mobile (single column, filters in a sheet).

## Test plan

- Unit: YouTube URL parser, tag normaliser, prescription schema, category depth rule.
- Integration: RLS on categories/exercises/media; cross-tenant references rejected;
  delete-category behaviour; accent-insensitive search.
- E2E: create category + exercise with a YouTube Short link; filter by body area and tag.

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

- **Composite FKs everywhere**: every `(physio_id, …)` reference is composite. `exercises` →
  `categories` is `ON DELETE SET NULL (category_id)` (custom migration, so `physio_id` is never
  nulled). Media `position` uniqueness is scoped by `(physio_id, exercise_id, position)` so it
  cannot be used as a cross-tenant existence oracle.
- **Search**: `public.f_unaccent` immutable wrapper plus a trigram GIN index on
  `f_unaccent(lower(name))`. The name matches as a substring, tags as a prefix; LIKE wildcards
  are escaped.
- **URL params**: `?q=&category=<uuid>|none|archived&area=&tag=&view=grid|list`; results are
  capped at 500.
- **Media**: YouTube only (watch, youtu.be, shorts; `www.`/`m.` hosts). The canonical URL is
  stored. Shorts are detected from a `/shorts/` URL only (a Short shared as `youtu.be` plays
  16:9). Click-to-load `youtube-nocookie` embed, `i.ytimg.com` thumbnails, at most 10 videos;
  media is replaced wholesale on save.
- **Tags** are normalised (lowercase, trimmed, `#` and commas stripped), at most 20 of 30 chars.
  The tag input is a combobox with a plain listbox (no shadcn command/popover).
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
- **`listTags`** covers active (non-archived) exercises only, so the tag filter never offers a tag
  that matches nothing in the default view. Search lower-cases the term in SQL.
- **Exercise form** dispatches from `onSubmit` (no React form reset) and is not re-keyed after
  save, so "Saved" persists and typed values are kept.
- **Delete** is always allowed until spec 05 adds a `routine_items` FK (then "inUse" + archive).
- **E2E found a mobile layout bug**: a long video URL widened the page horizontally (grid
  column sized to content). Fixed with `min-w-0`/`grid-cols-1` on the media rows and sortable
  items; the e2e asserts no horizontal overflow. Real keyboard reorder (categories and videos)
  is covered end to end because unit tests cannot drive dnd-kit.
