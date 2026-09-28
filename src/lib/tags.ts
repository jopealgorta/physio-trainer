/** Free-form exercise tags (spec 03): lowercase, trimmed, single-spaced. */
export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 30;

export function normalizeTag(raw: string): string {
  return raw.normalize("NFC").replace(/[,#]/g, " ").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Normalised, non-empty, unique tags in first-seen order. Length limits are the schema's job. */
export function normalizeTags(values: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const tag = normalizeTag(value);
    if (tag) seen.add(tag);
  }
  return [...seen];
}

/** Text typed or pasted into the tag input: "Band, rubber" → ["band", "rubber"]. */
export function splitTagInput(text: string): string[] {
  return normalizeTags(text.split(","));
}
