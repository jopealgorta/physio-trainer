# 03 · Exercise library

- **Status:** Not started
- **Feature:** Core
- **Depends on:** 01, 02

## Summary

Each physio has a private library of exercises (rehab and gym alike) with instructions,
default prescription values, videos/images, body areas and tags, organised in a two-level
category tree. Routines (spec 05) are built by picking from this library.

## Goals

- Create, edit, archive and restore exercises.
- Categories: top level + one level of sub-categories; create, rename, reorder, delete.
- Media per exercise: upload videos and images, or add YouTube/Vimeo links; reorder; first
  item is the cover.
- Fast browsing: search by name, filter by category, body area, tag; grid and list views.
- Default prescription (sets, reps, hold, …) copied into routines when the exercise is added.

## Non-goals

- Shared/global exercise catalogue, seed data, CSV import (feature G, deferred).
- Video transcoding/streaming pipeline (uploads are served as-is; see open questions).

## User stories

- As a physio, I add "Single-leg bridge" with a 20 s video, cues and default 3 × 12.
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

| Column                                                 | Type                                                    | Notes                                                           |
| ------------------------------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------- |
| `id`, `physio_id`, `exercise_id` (cascade), timestamps |                                                         |                                                                 |
| `kind`                                                 | enum `video_upload \| image_upload \| youtube \| vimeo` |                                                                 |
| `storage_path`                                         | text null                                               | for uploads: `{physio_id}/exercises/{exercise_id}/{uuid}.{ext}` |
| `external_url`                                         | text null                                               | for YouTube/Vimeo; store the parsed video id too                |
| `external_id`                                          | text null                                               |                                                                 |
| `thumbnail_path`                                       | text null                                               | poster frame/thumbnail                                          |
| `position`                                             | integer not null                                        | 0 = cover                                                       |

Check constraint: uploads have `storage_path`, external kinds have `external_id`.

Storage: private bucket `exercise-media`; storage RLS on the first path segment = `auth.uid()`.
Limits: video ≤ 100 MB (`video/mp4`, `video/webm`, `video/quicktime`), image ≤ 10 MB
(`image/jpeg`, `image/png`, `image/webp`). Configure the bucket's size/mime limits too.

## Routes and UI

| Route                   | Kind          | Purpose                                                                                                                                                                                                           |
| ----------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/library`              | page          | Left: category tree (collapsible, "All", "Uncategorised", "Archived"). Main: search, filters (body area, tags), grid of exercise cards (cover thumbnail, name, area badges), toggle to list view. "New exercise". |
| `/library/new`          | page          | Exercise form.                                                                                                                                                                                                    |
| `/library/[exerciseId]` | page          | Detail + edit form: name, category select (grouped), instructions, body areas (multi `BodyAreaPicker`), tags (combobox with existing tags), defaults, media manager. Archive/restore.                             |
| Category management     | dialog/inline | Add, rename, drag to reorder, delete (confirm; exercises move to Uncategorised).                                                                                                                                  |

- Media manager: drag-and-drop upload with progress (direct browser → Storage upload using a
  signed upload URL from a server action), paste a YouTube/Vimeo URL, reorder by drag, delete.
  Video preview plays inline, muted and looping.
- Empty state for a new physio: explain categories and offer "Create your first exercise".
- Filters and search are reflected in the URL (`?q=&area=&tag=&category=`).

## Behaviour and rules

1. Deleting a category with sub-categories deletes the sub-categories; their exercises become
   uncategorised (confirm dialog shows counts).
2. Exercises cannot be hard-deleted once used in a routine; offer archive. Unused exercises can
   be deleted (also removes their storage objects).
3. YouTube URLs accepted: `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`; Vimeo:
   `vimeo.com/{id}`. Parse to an id; render with privacy-enhanced embeds
   (`youtube-nocookie.com`, Vimeo `dnt=1`).
4. Search matches name (trigram, accent-insensitive via `unaccent`) and tags.
5. Deleting media removes the storage object in the same action (best effort; log failures).

## Security and privacy

- All tables follow the tenancy rules (physio_id + RLS, `withPhysio`).
- Upload server action checks ownership of `exercise_id` and issues a signed upload URL for a
  path it generates (never a client-supplied path).
- Media is served to physios via signed URLs (e.g. 1 h). Patients get signed URLs through
  spec 10.

## i18n

Namespace `Library` (+ `Library.categories`, `Library.media`, `Library.form`).

## Acceptance criteria

- [ ] CRUD for categories (2 levels max) and exercises; archive/restore.
- [ ] Upload video/image with progress; YouTube/Vimeo links embed correctly; reorder media.
- [ ] Search + filter by category, body area and tag, reflected in the URL.
- [ ] Shared prescription zod schema and Drizzle helper exist and are tested.
- [ ] RLS integration tests for all three tables and the storage bucket.
- [ ] Works on mobile (single column, filters in a sheet).

## Test plan

- Unit: YouTube/Vimeo URL parser, tag normaliser, prescription schema, category depth rule.
- Integration: RLS on categories/exercises/media; storage policy; delete-category behaviour.
- E2E: create category + exercise with an image upload and a YouTube link; filter by body area.

## Open questions

1. Do you want thumbnails generated from uploaded videos (needs a processing step, e.g. a
   Supabase Edge Function with ffmpeg or client-side capture), or is a manually chosen
   image enough for v1? Recommended: capture a frame in the browser at upload time.
2. Is 100 MB per video right? Typical exercise clips are 10–30 s.

## Decisions made during implementation

(Fill in while building.)
