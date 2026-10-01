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

/**
 * True for `/{handle}/{slug}-{code}`. A first segment that is a reserved handle is an app route
 * (`/routines/…`), which is why handles can never take those names.
 */
export function isPatientPath(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 2) return false;
  const [handle, slug] = segments as [string, string];
  return !RESERVED_HANDLES.has(handle) && parseSlugParam(slug) !== null;
}
