import { z } from "zod";

/**
 * Canonical body areas (spec 02), head to toe. Single source for the Postgres enum
 * (src/db/schema/enums.ts), zod, translations (BodyAreas.areas.*) and the picker.
 * Adding a value needs a migration; removing one is hard, so treat this list as append-only.
 */
export const BODY_AREAS = [
  "head_jaw",
  "neck",
  "shoulder",
  "upper_back",
  "chest",
  "upper_arm",
  "elbow",
  "forearm_wrist_hand",
  "lower_back",
  "abdomen_core",
  "hip_groin",
  "glute",
  "thigh",
  "knee",
  "lower_leg",
  "ankle_foot",
  "full_body",
] as const;
export type BodyArea = (typeof BODY_AREAS)[number];

export const BODY_SIDES = ["left", "right", "both"] as const;
export type BodySide = (typeof BODY_SIDES)[number];

/** The side a single map region stands for. */
export type RegionSide = Exclude<BodySide, "both">;

/** Areas drawn once per side on the body map. Everything else is midline. */
export const PAIRED_BODY_AREAS = [
  "shoulder",
  "upper_arm",
  "elbow",
  "forearm_wrist_hand",
  "hip_groin",
  "glute",
  "thigh",
  "knee",
  "lower_leg",
  "ankle_foot",
] as const satisfies readonly BodyArea[];

export const bodyAreaSchema = z.enum(BODY_AREAS);
export const bodySideSchema = z.enum(BODY_SIDES);

/** Injury cases (spec 04) record one concrete area: full_body only makes sense for exercises. */
export const caseBodyAreaSchema = bodyAreaSchema.exclude(["full_body"]);
export type CaseBodyArea = z.infer<typeof caseBodyAreaSchema>;
export const CASE_BODY_AREAS = caseBodyAreaSchema.options;

export function isPairedArea(area: BodyArea): boolean {
  return (PAIRED_BODY_AREAS as readonly BodyArea[]).includes(area);
}

/** Single-mode picker value. `side` is null for midline areas or when no side was chosen. */
export type BodyAreaSelection = { area: BodyArea; side: BodySide | null };

/** Multi mode: include or exclude `area`, returning a new, deduplicated array in canonical order. */
export function setArea(value: readonly BodyArea[], area: BodyArea, selected: boolean): BodyArea[] {
  const next = new Set(value);
  if (selected) next.add(area);
  else next.delete(area);
  return BODY_AREAS.filter((candidate) => next.has(candidate));
}

/** Multi mode: add or remove `area`, returning a new array in canonical order. */
export function toggleArea(value: readonly BodyArea[], area: BodyArea): BodyArea[] {
  return setArea(value, area, !value.includes(area));
}

const otherSide = (side: RegionSide): RegionSide => (side === "left" ? "right" : "left");

/**
 * Single mode: the value after clicking a map region or choosing an area in the list.
 * `clicked` is the region's side (null for midline regions and list choices).
 * With sides, clicking both sides of a paired area gives "both"; clicking the only chosen side
 * again clears the selection, and clicking a selected midline area again clears it too.
 */
export function selectArea(
  value: BodyAreaSelection | null,
  area: BodyArea,
  clicked: RegionSide | null,
  withSide: boolean,
): BodyAreaSelection | null {
  const side = withSide && isPairedArea(area) ? clicked : null;
  if (value?.area !== area) return { area, side };
  if (side === null) return null;
  if (value.side === null) return { area, side };
  if (value.side === side) return null;
  if (value.side === "both") return { area, side: otherSide(side) };
  return { area, side: "both" };
}

/** Whether a map region is highlighted for a single-mode value. */
export function coversRegion(
  value: BodyAreaSelection | null,
  area: BodyArea,
  regionSide: RegionSide | null,
): boolean {
  if (value?.area !== area) return false;
  return (
    regionSide === null || value.side === null || value.side === "both" || value.side === regionSide
  );
}
