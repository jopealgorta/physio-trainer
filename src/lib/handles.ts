/**
 * Physio handles are the first segment of every patient link: /{handle}/{slug}.
 * They must never collide with a top-level app route (enforced by handles.test.ts).
 */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  // App routes
  "api",
  "auth",
  "customers",
  "dashboard",
  "library",
  "login",
  "logout",
  "plans",
  "routines",
  "settings",
  "signup",
  "onboarding",
  "offline",
  // Framework and well-known paths
  "_next",
  "static",
  "public",
  "assets",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "manifest.webmanifest",
  "icon",
  "apple-icon",
  "sw.js",
  ".well-known",
  // Names that would look official or confusing in a share link
  "about",
  "admin",
  "app",
  "blog",
  "contact",
  "help",
  "legal",
  "pricing",
  "privacy",
  "support",
  "terms",
  "www",
]);

const HANDLE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 30;

export type HandleProblem = "tooShort" | "tooLong" | "format" | "reserved";

/** The first rule a handle breaks, or null when it can be used (uniqueness is checked in the DB). */
export function handleProblem(handle: string): HandleProblem | null {
  if (handle.length < HANDLE_MIN_LENGTH) return "tooShort";
  if (handle.length > HANDLE_MAX_LENGTH) return "tooLong";
  if (!HANDLE_PATTERN.test(handle)) return "format";
  if (RESERVED_HANDLES.has(handle)) return "reserved";
  return null;
}

export function isValidHandle(handle: string): boolean {
  return handleProblem(handle) === null;
}

/** Handle derived from a display name as the physio types it. May be "" (e.g. "李伟"). */
export function handleFromName(displayName: string): string {
  return fitHandle(slugify(displayName), HANDLE_MAX_LENGTH);
}

export const MAX_HANDLE_CANDIDATES = 20;
const FALLBACK_HANDLE_BASE = "physio";

/**
 * Suggestions in order of preference: "maria-lopez", "maria-lopez-2", … Only valid handles;
 * the caller picks the first one that is not taken.
 */
export function handleCandidates(displayName: string): string[] {
  const slug = handleFromName(displayName);
  const base = slug.length >= HANDLE_MIN_LENGTH ? slug : FALLBACK_HANDLE_BASE;
  const candidates: string[] = [];
  for (
    let n = 1;
    candidates.length < MAX_HANDLE_CANDIDATES && n <= MAX_HANDLE_CANDIDATES * 2;
    n++
  ) {
    const suffix = n === 1 ? "" : `-${n}`;
    const candidate = fitHandle(base, HANDLE_MAX_LENGTH - suffix.length) + suffix;
    if (isValidHandle(candidate)) candidates.push(candidate);
  }
  return candidates;
}

const PLACEHOLDER_HANDLE = /^physio-[0-9a-f]{8}$/;

/** True for the random handle the sign-up trigger assigns before onboarding. */
export function isPlaceholderHandle(handle: string): boolean {
  return PLACEHOLDER_HANDLE.test(handle);
}

function fitHandle(value: string, maxLength: number): string {
  return value.slice(0, maxLength).replace(/-+$/, "");
}

/** "María López" → "maria-lopez". Used for handles and share-link slugs. */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
