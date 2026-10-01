import { RESERVED_HANDLES } from "./handles";
import { parseSlugParam } from "./share-links";

/**
 * Headers for every patient page (spec 10 rules 5 and 9): never cached by shared caches, never
 * indexed, and the link (which carries the code) is not leaked through the Referer header.
 */
export const PATIENT_HEADERS = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `value` looks like a database id (the workout route's `routineId`). */
export const isUuid = (value: string) => UUID.test(value);

/**
 * True for the patient page `/{handle}/{slug}-{code}` and the pages under it
 * (`/{handle}/{slug}-{code}/workout/{routineId}`). A first segment that is a reserved handle is
 * an app route (`/routines/…`), which is why handles can never take those names.
 */
export function isPatientPath(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 2 && segments.length !== 4) return false;
  const [handle, slug, section, routineId] = segments as [string, string, string?, string?];
  if (RESERVED_HANDLES.has(handle) || parseSlugParam(slug) === null) return false;
  return segments.length === 2 || (section === "workout" && routineId !== undefined);
}

/** `{pagePath}/workout/{routineId}`, with the plan entry it was started from (spec 13 logs it). */
export function buildWorkoutPath(pagePath: string, routineId: string, entryId?: string | null) {
  const query = entryId ? `?entry=${encodeURIComponent(entryId)}` : "";
  return `${pagePath}/workout/${routineId}${query}`;
}
