import { pgEnum } from "drizzle-orm/pg-core";

// Relative import: drizzle-kit loads the schema without the "@/" alias.
import { BODY_AREAS, BODY_SIDES } from "../../lib/body-areas";
import { VERSION_KINDS } from "../../lib/history/kinds";
import { EXERCISE_KINDS } from "../../lib/exercise-kinds";
import { CASE_STATUSES, CUSTOMER_SEXES } from "../../lib/customers";
import { PRESCRIPTION_SIDES } from "../../lib/prescription";
import { ROUTINE_STATUSES } from "../../lib/routines";
import { SHARE_TARGETS } from "../../lib/share-links";

/** Body areas and sides (spec 02). Values come from src/lib/body-areas.ts. */
export const bodyAreaEnum = pgEnum("body_area", BODY_AREAS);
export const bodySideEnum = pgEnum("body_side", BODY_SIDES);

/** Prescription side (spec 03, shared with routine items in spec 05). */
export const prescriptionSideEnum = pgEnum("prescription_side", PRESCRIPTION_SIDES);

/** Exercise media kinds. Append-only: uploads/Vimeo add values in a later spec. */
export const EXERCISE_MEDIA_KINDS = ["youtube"] as const;
export const exerciseMediaKindEnum = pgEnum("exercise_media_kind", EXERCISE_MEDIA_KINDS);

/** Customer sex and case status (spec 04). Values come from src/lib/customers.ts. */
export const customerSexEnum = pgEnum("customer_sex", CUSTOMER_SEXES);
export const caseStatusEnum = pgEnum("case_status", CASE_STATUSES);

/** Routine lifecycle (spec 05). Values come from src/lib/routines.ts. */
export const routineStatusEnum = pgEnum("routine_status", ROUTINE_STATUSES);

/** What a share link opens (spec 10). Values come from src/lib/share-links.ts. */
export const shareTargetEnum = pgEnum("share_target", SHARE_TARGETS);

/** What produced a version snapshot (spec 15). Values come from src/lib/history/kinds.ts. */
export const versionKindEnum = pgEnum("version_kind", VERSION_KINDS);

/** Strength or aerobic exercise (spec 19). Values come from src/lib/exercise-kinds.ts. */
export const exerciseKindEnum = pgEnum("exercise_kind", EXERCISE_KINDS);
