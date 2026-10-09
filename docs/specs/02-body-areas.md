# 02 · Body areas

- **Status:** Done
- **Feature:** H (body-area picker)
- **Depends on:** 01

## Summary

A fixed list of body areas plus a side (left/right/both), with a reusable picker component
(clickable body map plus an accessible list). Used to tag exercises (spec 03) and to record
where an injury is (spec 04), so physios can filter exercises by the area they are treating.

## Goals

- One canonical list of body areas, shared by the database enum, TypeScript and translations.
- A `BodyAreaPicker` component: a compact field that opens a front/back body outline (SVG) with
  clickable regions beside equivalent region chips for keyboard and screen-reader users.
- Single-select mode (injury: one area + side) and multi-select mode (exercise: many areas, no side).
- Display helpers: `BodyAreaBadge`, localised labels.

## Non-goals

- Anatomical detail beyond the listed regions (individual muscles, joints).
- Physio-defined custom areas (use categories in spec 03 instead).

## Data model

No tables. Adds Postgres enums in `src/db/schema/enums.ts`:

- `body_area`: `head_jaw`, `neck`, `shoulder`, `upper_back`, `chest`, `upper_arm`, `elbow`,
  `forearm_wrist_hand`, `lower_back`, `abdomen_core`, `hip_groin`, `glute`, `thigh`, `knee`,
  `lower_leg`, `ankle_foot`, `full_body`.
- `body_side`: `left`, `right`, `both`.

`full_body` is valid for exercises only; the case form (spec 04) hides it.

Mirror both in `src/lib/body-areas.ts` as `const` arrays + types (single source; the Drizzle
enum is built from the same array).

## Routes and UI

No routes. Components in `src/components/body-areas/`:

- `BodyAreaPicker` (client): props `mode: "single" | "multi"`, `value`, `onChange`,
  `withSide?: boolean`, `name` (renders hidden inputs so it works inside a native `<form>`).
- Closed, it is one field row showing the chosen areas as badges (like the Categories field).
  It opens a `Popover` (a bottom sheet on phones) with a Front/Back toggle, the SVG map, and
  chips grouped Upper body / Trunk / Lower body / Other. Hover and selected states use
  `primary`. Regions have `aria-label`s.
- `BodyAreaBadge`: small badge with label (and side, e.g. "Knee · Left").

## Behaviour and rules

1. Clicking a region toggles it (multi) or selects it (single).
2. Paired areas (shoulder, elbow, knee, …) are one region per side on the map. Clicking the
   left knee in single mode with `withSide` sets `{ area: "knee", side: "left" }`; selecting
   both knees sets side `both`.
3. The chips and the map stay in sync; the chips are always rendered next to the map.

## Security and privacy

None (static data).

## i18n

Namespace `BodyAreas` with one key per area and side.

## Acceptance criteria

- [x] Enum values in the DB, TS arrays and `messages/en.json` stay in sync (unit test).
- [x] Picker works with mouse, touch and keyboard; screen readers announce region names and selection.
- [x] Works in single-with-side and multi modes inside a native form submission.
- [x] Looks right in light and dark mode, desktop and mobile.

## Test plan

- Unit: enum/translation sync; side resolution logic.
- Component: select/deselect in both modes; hidden inputs carry the value.
- E2E: covered by specs 03 and 04 forms.

## Open questions

1. Is this list of areas right for your practice? Anything to add (e.g. "ribs", "pelvic floor")?
   **Answer (2026-09-28):** keep the 17 listed areas as is.
2. Do you have a body-outline illustration style in mind, or should we draw a simple minimalist one?
   **Answer:** minimal segmented silhouette (simple region shapes, neutral fill, `primary` on
   hover/selected, gender-neutral), drawn in-house.
3. With no consumer until specs 03/04, how is the picker viewable in this PR?
   **Answer:** a dev-only preview page at `/dev/body-areas` (404 in production); `dev` is added
   to `RESERVED_HANDLES`.

## Decisions made during implementation

- **Single source:** `src/lib/body-areas.ts` holds `BODY_AREAS`, `BODY_SIDES`, `PAIRED_BODY_AREAS`,
  the zod schemas (`bodyAreaSchema`, `bodySideSchema`, `caseBodyAreaSchema`) and `CASE_BODY_AREAS`
  (all areas minus `full_body`, for spec 04). The `body_area`/`body_side` pgEnums in
  `src/db/schema/enums.ts` are built from the same arrays; an integration test checks
  `enum_range()` in Postgres against them. Treat the list as append-only.
- **Single mode means injury:** it never offers `full_body` (no list item, no map region).
- **Sides:** midline areas (head/jaw, neck, chest, upper back, lower back, abdomen/core) store
  `side: null`. With `withSide`, map clicks on a paired area follow `selectArea()`: first side →
  that side; other side → `both`; one side of `both` → the other side; the only chosen side
  again → cleared. Choosing a paired area from the list starts with no side (the side radios
  then appear); clicking a selected midline region again clears it. Multi mode ignores sides.
- **Redesign (2026-10-09):** the first version always showed two ~300px box-figure maps plus a
  17-row checkbox/radio list (~650px in the exercise form). Now:
  - **Field + popover:** a one-row outline field with `BodyAreaBadge`s (placeholder "Choose body
    areas" / "Choose a body area"), named by its label plus the summary. The panel title shares
    its row with Clear (shown while something is chosen) and Done so the panel fits below a
    field mid-form. The hidden inputs render next to the field, outside the portalled panel.
  - **Chips, not a list:** one shadcn `ToggleGroup` (added in this change) holds every chip, so
    arrow keys move across groups; `type="multiple"` (buttons with `aria-pressed`) for exercises,
    `type="single"` (radios) for injuries. Choosing the selected injury chip again clears it.
    Groups come from `BODY_AREA_GROUPS` in `src/lib/body-areas.ts` (`BodyAreas.groups.*`);
    `full_body` sits alone under "Other" and is hidden in single mode. The side is a segmented
    Left / Both / Right `ToggleGroup` under the chips, shown for paired areas; a chosen side
    fills with `primary` like a chip, while the Front/Back view toggle stays muted.
  - **One view at a time** with a Front/Back toggle at every width; a caption under the map
    names the hovered region, else a hint.
  - **Silhouette:** regions are hand-drawn `path`s (absolute M/L/C/Z only) that share edges and
    are stroked in `popover`, so they read as one gender-neutral figure with thin seams: arms
    slightly away from the body, trapezius slope in the chest/upper back, a slight waist.
    `pathBounds()` and `mirrorPath()` (pure string transforms) replace the rect/ellipse maths.
  - **No form-reset guard:** the picker has no Radix form controls any more, so React 19's
    post-action `form.reset()` has nothing to rewind; the reset-listener hack is gone (a test
    still pins that the value survives a form action).
  - **Exercise form:** body areas moved from a side column into the field stack under
    Categories; the form is one column at every width, capped at `max-w-3xl` on the page.
  - **Focus and errors:** opening the panel focuses the chosen chip (else the first), not Clear.
    `invalid`/`describedBy` props put `aria-invalid` and the error message on the field (the
    case form passes both its area and side errors).
  - **Phone:** the map column is 8.5rem in the bottom sheet (9rem from `sm`); the chips are the
    precise path for small regions such as the elbow.
- **Form contract:** multi mode renders one hidden `name` input per area (canonical order,
  none when empty; read with `formData.getAll`). Single mode renders `name` (area or `""`)
  and, with `withSide`, `sideName` (default `${name}Side`, side or `""`). Radix checkbox/radio
  internals submit nothing.
- **Form reset keeps the picker's value** (controlled or not), without calling `onChange`.
  _(Superseded by the 2026-10-09 redesign: no Radix form controls, no guard.)_
  React 19 resets a `<form action={fn}>` after every action, and Radix's Checkbox/RadioGroup
  answer a reset by reporting their mount-time value, which corrupted the selection (and could
  report `{ area: "" }`). The form the picker lives in usually re-renders with the saved value,
  so wiping it is never what the physio wants; a parent that wants a blank picker passes a new
  `value` or `key`. The picker ignores changes reported while its form dispatches `reset`
  (document-level capture/bubble listeners bracket the dispatch), checkboxes set rather than
  toggle, and radio values are validated with zod before use.
- **Side phrase:** `withSide` selects on the raw side key (`{side, select, …}`), so Spanish
  reads "Rodilla · lado izquierdo" / "ambos lados" and agrees with any area's gender.
  `sides.*` stays for the side radio labels.
- **Container queries** _(superseded 2026-10-09: the picker is a field + popover)_: a `@container` div inside the fieldset; the map toggle, two-view grid and list
  columns follow the picker's width (spec 04 embeds it in a sheet). A single view renders wider
  (`max-w-60`) for bigger touch targets. Because of `container-type: inline-size`, the picker
  needs a parent with a definite width: inside a shrink-to-fit parent (`w-fit` dialog,
  inline-flex row) it collapses, so give it a width there.
- **Map front view is mirrored:** the patient's left is on the viewer's right; the back view is
  not mirrored. The geometry is data in `body-map-regions.ts`, pinned by tests for mirroring,
  bounds and coverage.
- **Accessibility:** the chips (originally a shadcn `Checkbox`/`RadioGroup` list) are the
  keyboard path. Map regions are `role="checkbox"` with `aria-checked` and names like
  "Knee · Left", announced but not tab stops, so there are no duplicate tab stops across the two
  views.
- **Styling:** unselected regions use `fill-muted-foreground/20` with a `stroke-popover` seam
  (`fill-muted` was almost invisible in light mode). Hover is `primary/40` and selected is
  `primary`.
- **Preview:** `/dev/body-areas` (404 in production) shows both modes, badges and the
  submitted FormData; `dev` is in `RESERVED_HANDLES`. No e2e here: Playwright runs a
  production build, so specs 03/04 cover e2e.
- **Test env:** `vitest.setup.ts` stubs `ResizeObserver` (jsdom lacks it; Radix needs it).
  `eslint.config.mjs` ignores `.claude/worktrees/**` (local agent worktrees broke `pnpm lint`).
