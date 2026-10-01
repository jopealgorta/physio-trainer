import { describe, expect, it } from "vitest";

import {
  DRAFT_PREFIX,
  MAX_NOTES_LIMIT,
  PAGE_SIZE,
  draftKey,
  excerpt,
  hasSoapContent,
  notesHref,
  parseNotesParams,
  wasEdited,
} from "./visit-notes";

describe("excerpt", () => {
  it("collapses whitespace and keeps short text as is", () => {
    expect(excerpt("  knee   hurts\n\nwhen stairs ", 80)).toBe("knee hurts when stairs");
  });

  it("truncates long text with an ellipsis", () => {
    expect(excerpt("abcdefghij", 5)).toBe("abcde…");
  });

  it("returns an empty string for blank or missing text", () => {
    expect(excerpt("  \n ", 10)).toBe("");
    expect(excerpt(null, 10)).toBe("");
  });
});

describe("wasEdited", () => {
  const created = new Date("2026-10-01T10:00:00Z");

  it("is false within one minute of creation", () => {
    expect(wasEdited(created, new Date("2026-10-01T10:01:00Z"))).toBe(false);
    expect(wasEdited(created, created)).toBe(false);
  });

  it("is true once more than a minute has passed", () => {
    expect(wasEdited(created, new Date("2026-10-01T10:01:01Z"))).toBe(true);
  });
});

describe("hasSoapContent", () => {
  it("needs at least one non-blank section", () => {
    expect(hasSoapContent({ subjective: " ", objective: null })).toBe(false);
    expect(hasSoapContent({ subjective: "", assessment: "Improving" })).toBe(true);
    expect(hasSoapContent({})).toBe(false);
  });
});

describe("draftKey", () => {
  it("is scoped per customer and note", () => {
    expect(draftKey("c1", null)).toBe(`${DRAFT_PREFIX}c1:new`);
    expect(draftKey("c1", "n1")).toBe(`${DRAFT_PREFIX}c1:n1`);
  });
});

describe("parseNotesParams", () => {
  const caseId = "0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10";

  it("defaults to no filter and one page", () => {
    expect(parseNotesParams({})).toEqual({ caseId: null, limit: PAGE_SIZE });
  });

  it("reads a case id and a limit", () => {
    expect(parseNotesParams({ case: caseId, notes: "40" })).toEqual({ caseId, limit: 40 });
  });

  it("ignores a malformed case id and clamps the limit", () => {
    expect(parseNotesParams({ case: "nope", notes: "3" })).toEqual({
      caseId: null,
      limit: PAGE_SIZE,
    });
    expect(parseNotesParams({ notes: "999999" }).limit).toBe(MAX_NOTES_LIMIT);
    expect(parseNotesParams({ notes: "abc" }).limit).toBe(PAGE_SIZE);
    expect(parseNotesParams({ notes: "25.5" }).limit).toBe(PAGE_SIZE);
  });
});

describe("notesHref", () => {
  const caseId = "0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10";

  it("keeps the notes tab and only sets non-default params", () => {
    expect(notesHref("c1", { caseId: null, limit: PAGE_SIZE })).toBe("/customers/c1?tab=notes");
    expect(notesHref("c1", { caseId, limit: PAGE_SIZE * 2 })).toBe(
      `/customers/c1?tab=notes&case=${caseId}&notes=40`,
    );
  });

  it("applies changes on top of the current filters", () => {
    const filters = { caseId, limit: 40 };
    expect(notesHref("c1", filters, { limit: 60 })).toContain("notes=60");
    expect(notesHref("c1", filters, { caseId: null, limit: PAGE_SIZE })).toBe(
      "/customers/c1?tab=notes",
    );
  });
});
