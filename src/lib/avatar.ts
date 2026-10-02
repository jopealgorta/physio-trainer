/**
 * The physio's profile photo from their sign-in provider (Google sends `avatar_url` and
 * `picture` in the user metadata). Pure: used by the post-sign-in step.
 */

/** Same limit as the `physios_avatar_url_format` check. */
export const AVATAR_URL_MAX_LENGTH = 2048;

/** An https URL the database check accepts (lower-case scheme, length) and that parses. */
export function isAvatarUrl(value: string): boolean {
  if (!value.startsWith("https://") || value.length > AVATAR_URL_MAX_LENGTH) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname !== "" && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** The first usable photo URL in the metadata (`avatar_url`, then `picture`), or null. */
export function avatarFromMetadata(metadata: unknown): string | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  const record = metadata as Record<string, unknown>;
  for (const key of ["avatar_url", "picture"]) {
    const value = record[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (isAvatarUrl(trimmed)) return trimmed;
  }
  return null;
}
