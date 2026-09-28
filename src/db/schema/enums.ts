import { pgEnum } from "drizzle-orm/pg-core";

// Relative import: drizzle-kit loads the schema without the "@/" alias.
import { BODY_AREAS, BODY_SIDES } from "../../lib/body-areas";

/** Body areas and sides (spec 02). Values come from src/lib/body-areas.ts. */
export const bodyAreaEnum = pgEnum("body_area", BODY_AREAS);
export const bodySideEnum = pgEnum("body_side", BODY_SIDES);
