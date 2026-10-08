// Imported by the Drizzle schema via a relative path: keep this file free of "@/" imports
// and server-only modules.
export const ROUTINE_STATUSES = ["draft", "active", "archived"] as const;
export type RoutineStatus = (typeof ROUTINE_STATUSES)[number];

export const ROUTINE_NAME_MAX = 80;
export const ROUTINE_NOTES_MAX = 2000;
export const MAX_ITEMS = 50;
export const MAX_SETS = 20;
export const MAX_SECTIONS = 12;
export const SECTION_NAME_MAX = 60;
/** A superset groups between GROUP_MIN and GROUP_MAX consecutive exercises. */
export const GROUP_MIN = 2;
export const GROUP_MAX = 3;
export const SESSIONS_PER_WEEK = { min: 1, max: 14 } as const;
export const SESSIONS_PER_DAY = { min: 1, max: 5 } as const;
export const ROUTINE_SEARCH_MAX_LENGTH = 100;
export const ROUTINES_LIST_LIMIT = 500;
