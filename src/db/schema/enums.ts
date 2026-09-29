import { pgEnum } from "drizzle-orm/pg-core";

// Relative import: drizzle-kit loads the schema without the "@/" alias.
import { BODY_AREAS, BODY_SIDES } from "../../lib/body-areas";
import { PRESCRIPTION_SIDES } from "../../lib/prescription";

/** Body areas and sides (spec 02). Values come from src/lib/body-areas.ts. */
export const bodyAreaEnum = pgEnum("body_area", BODY_AREAS);
export const bodySideEnum = pgEnum("body_side", BODY_SIDES);

/** Prescription side (spec 03, shared with routine items in spec 05). */
export const prescriptionSideEnum = pgEnum("prescription_side", PRESCRIPTION_SIDES);

/** Exercise media kinds. Append-only: uploads/Vimeo add values in a later spec. */
export const EXERCISE_MEDIA_KINDS = ["youtube"] as const;
export const exerciseMediaKindEnum = pgEnum("exercise_media_kind", EXERCISE_MEDIA_KINDS);
