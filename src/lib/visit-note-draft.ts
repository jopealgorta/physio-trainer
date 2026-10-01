import { NOTE_FIELD_KEYS, type NoteFields } from "./visit-notes";

/**
 * Unsaved note drafts live in localStorage so an accidental close doesn't lose them. Storage can
 * be missing or throw (private windows, blocked site data), so every access is guarded and the
 * editor works without it.
 */
export function readDraft(key: string): NoteFields | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (typeof parsed !== "object" || parsed === null) return null;
    const source = parsed as Record<string, unknown>;
    const draft: Partial<NoteFields> = {};
    for (const field of NOTE_FIELD_KEYS) {
      const value = source[field];
      if (typeof value !== "string") return null;
      draft[field] = value;
    }
    return draft as NoteFields;
  } catch {
    return null;
  }
}

export function writeDraft(key: string, fields: NoteFields): void {
  try {
    localStorage.setItem(key, JSON.stringify(fields));
  } catch {
    // Draft autosave is best effort.
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
