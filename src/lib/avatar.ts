/**
 * The physio's profile photo from their sign-in provider (Google sends `avatar_url` and
 * `picture` in the user metadata). Pure: used by the post-sign-in step and the schema check.
 *
 * The metadata is user-editable (Supabase lets a signed-in user update it), and the URL is loaded
 * by patients' browsers on the patient page, so only Google's photo host is accepted: a physio
 * cannot make patients' browsers fetch from an arbitrary third-party host.
 */

/** Same limit as the `physios_avatar_url_format` check. */
export const AVATAR_URL_MAX_LENGTH = 2048;

/**
 * https on a `*.googleusercontent.com` host (lower-case labels, no user info, no port), then an
 * optional path of printable ASCII. A POSIX-compatible regex: the `physios_avatar_url_format`
 * check and the sign-up trigger use this exact source, so app and database agree.
 */
export const AVATAR_URL_PATTERN =
  "^https://([a-z0-9]([a-z0-9-]*[a-z0-9])?\\.)+googleusercontent\\.com(/[!-~]*)?$";

const avatarUrlRegex = new RegExp(AVATAR_URL_PATTERN);

/** A Google photo URL the database check accepts. */
export function isAvatarUrl(value: string): boolean {
  return value.length <= AVATAR_URL_MAX_LENGTH && avatarUrlRegex.test(value);
}

/** The first usable photo URL in the metadata (`avatar_url`, then `picture`), or null. */
export function avatarFromMetadata(metadata: unknown): string | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  const record = metadata as Record<string, unknown>;
  for (const key of ["avatar_url", "picture"]) {
    const value = record[key];
    if (typeof value !== "string") continue;
    // Spaces only, like Postgres' trim() in the sign-up trigger.
    const trimmed = value.replace(/^ +| +$/g, "");
    if (isAvatarUrl(trimmed)) return trimmed;
  }
  return null;
}
