import type { Route } from "next";

import { firstParam } from "./search-params";

/** Visit note constants and pure helpers shared by the schema, zod and UI (spec 16). */
export const SOAP_FIELDS = ["subjective", "objective", "assessment", "plan"] as const;
export type SoapField = (typeof SOAP_FIELDS)[number];

export const SOAP_MAX = 10_000;
export const PAIN_MAX = 10;

/** The timeline shows this many notes at a time; "Load more" adds another page. */
export const PAGE_SIZE = 20;
export const MAX_NOTES_LIMIT = 500;

/** The editable fields of a note as form strings ("" = empty; `caseId` "" = no case). */
export type NoteFields = {
  visitedOn: string;
  caseId: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  pain: string;
};
export const NOTE_FIELD_KEYS = [
  "visitedOn",
  "caseId",
  "subjective",
  "objective",
  "assessment",
  "plan",
  "pain",
] as const satisfies readonly (keyof NoteFields)[];

export function sameFields(a: NoteFields, b: NoteFields): boolean {
  return NOTE_FIELD_KEYS.every((key) => a[key] === b[key]);
}

/** `updated_at` must be later than `created_at` by more than this to show "edited". */
const EDITED_AFTER_MS = 60_000;

export const DRAFT_PREFIX = "physio-trainer:visit-note-draft:";

/** Whitespace-collapsed text cut to `max` characters (with an ellipsis); "" when blank. */
export function excerpt(text: string | null | undefined, max: number): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat;
}

export function wasEdited(createdAt: Date, updatedAt: Date): boolean {
  return updatedAt.getTime() - createdAt.getTime() > EDITED_AFTER_MS;
}

/** True when at least one SOAP section has non-blank text. */
export function hasSoapContent(values: Partial<Record<SoapField, string | null>>): boolean {
  return SOAP_FIELDS.some((field) => (values[field] ?? "").trim() !== "");
}

/** Collapsed cards show about this many characters per section before offering "show more". */
const COLLAPSED_CHARS = 160;
const COLLAPSED_LINES = 2;

/** True when a collapsed card would hide part of a section (it is long or has many lines). */
export function needsExpand(values: Partial<Record<SoapField, string | null>>): boolean {
  return SOAP_FIELDS.some((field) => {
    const text = (values[field] ?? "").trim();
    return text.length > COLLAPSED_CHARS || text.split("\n").length > COLLAPSED_LINES;
  });
}

/**
 * The one-line excerpt for summaries: the assessment, or else the first non-empty section.
 * Null when every section is blank.
 */
export function summarize(
  values: Partial<Record<SoapField, string | null>>,
  max: number,
): { field: SoapField; text: string } | null {
  for (const field of ["assessment", "subjective", "objective", "plan"] as const) {
    const text = excerpt(values[field], max);
    if (text) return { field, text };
  }
  return null;
}

/** localStorage key for the unsaved draft of a new note (`noteId` null) or an edit. */
export function draftKey(customerId: string, noteId: string | null): string {
  return `${DRAFT_PREFIX}${customerId}:${noteId ?? "new"}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Notes tab filters, reflected in the URL (`?tab=notes&case=<id>&notes=40`). */
export type NotesFilters = { caseId: string | null; limit: number };

type Params = Record<string, string | string[] | undefined>;

export function parseNotesParams(params: Params): NotesFilters {
  const caseParam = firstParam(params.case);
  const raw = firstParam(params.notes);
  const limit = raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : PAGE_SIZE;
  return {
    caseId: caseParam && UUID_RE.test(caseParam) ? caseParam : null,
    limit: Math.min(MAX_NOTES_LIMIT, Math.max(PAGE_SIZE, limit)),
  };
}

/** The limit "Load more" should link to, or null once the cap is reached (older notes stay reachable through the case filter). */
export function nextLimit(limit: number): number | null {
  return limit >= MAX_NOTES_LIMIT ? null : Math.min(MAX_NOTES_LIMIT, limit + PAGE_SIZE);
}

export function notesHref(
  customerId: string,
  filters: NotesFilters,
  changes: Partial<NotesFilters> = {},
): Route {
  const next = { ...filters, ...changes };
  const params = new URLSearchParams({ tab: "notes" });
  if (next.caseId) params.set("case", next.caseId);
  if (next.limit !== PAGE_SIZE) params.set("notes", String(next.limit));
  return `/customers/${customerId}?${params.toString()}` as Route;
}
