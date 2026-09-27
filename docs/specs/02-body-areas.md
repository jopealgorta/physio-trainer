# 02 · Body areas

- **Status:** Not started
- **Feature:** H (body-area picker)
- **Depends on:** 01

## Summary

A fixed list of body areas plus a side (left/right/both), with a reusable picker component
(clickable body map plus an accessible list). Used to tag exercises (spec 03) and to record
where an injury is (spec 04), so physios can filter exercises by the area they are treating.

## Goals

- One canonical list of body areas, shared by the database enum, TypeScript and translations.
- A `BodyAreaPicker` component: front/back body outline (SVG) with clickable regions and an
  equivalent checkbox/radio list for keyboard and screen-reader users.
- Single-select mode (injury: one area + side) and multi-select mode (exercise: many areas, no side).
- Display helpers: `BodyAreaBadge`, localised labels.

## Non-goals

- Anatomical detail beyond the listed regions (individual muscles, joints).
- Physio-defined custom areas (use tags in spec 03 instead).

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
- SVG map: front and back views side by side on desktop, a front/back toggle on mobile. Hover
  and selected states use `primary`. Regions have `aria-label`s.
- `BodyAreaBadge`: small badge with label (and side, e.g. "Knee · Left").

## Behaviour and rules

1. Clicking a region toggles it (multi) or selects it (single).
2. Paired areas (shoulder, elbow, knee, …) are one region per side on the map. Clicking the
   left knee in single mode with `withSide` sets `{ area: "knee", side: "left" }`; selecting
   both knees sets side `both`.
3. The list view and the map stay in sync; the list is always rendered (visually secondary on
   desktop).

## Security and privacy

None (static data).

## i18n

Namespace `BodyAreas` with one key per area and side.

## Acceptance criteria

- [ ] Enum values in the DB, TS arrays and `messages/en.json` stay in sync (unit test).
- [ ] Picker works with mouse, touch and keyboard; screen readers announce region names and selection.
- [ ] Works in single-with-side and multi modes inside a native form submission.
- [ ] Looks right in light and dark mode, desktop and mobile.

## Test plan

- Unit: enum/translation sync; side resolution logic.
- Component: select/deselect in both modes; hidden inputs carry the value.
- E2E: covered by specs 03 and 04 forms.

## Open questions

1. Is this list of areas right for your practice? Anything to add (e.g. "ribs", "pelvic floor")?
2. Do you have a body-outline illustration style in mind, or should we draw a simple minimalist one?

## Decisions made during implementation

(Fill in while building.)
