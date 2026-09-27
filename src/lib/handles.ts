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
  // Framework and well-known paths
  "_next",
  "static",
  "public",
  "assets",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "manifest.webmanifest",
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

export function isValidHandle(handle: string): boolean {
  return (
    handle.length >= HANDLE_MIN_LENGTH &&
    handle.length <= HANDLE_MAX_LENGTH &&
    HANDLE_PATTERN.test(handle) &&
    !RESERVED_HANDLES.has(handle)
  );
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
