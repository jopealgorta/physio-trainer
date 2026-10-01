import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearDraft, readDraft, writeDraft } from "./visit-note-draft";
import type { NoteFields } from "./visit-notes";

const fields: NoteFields = {
  visitedOn: "2026-10-01",
  caseId: "",
  subjective: "Knee pain",
  objective: "",
  assessment: "",
  plan: "Squats",
  pain: "4",
};

beforeEach(() => localStorage.clear());

describe("visit note drafts", () => {
  it("round-trips a draft and clears it", () => {
    writeDraft("k", fields);
    expect(readDraft("k")).toEqual(fields);
    clearDraft("k");
    expect(readDraft("k")).toBeNull();
  });

  it("returns null when nothing is stored", () => {
    expect(readDraft("missing")).toBeNull();
  });

  it("ignores corrupt or incomplete drafts", () => {
    localStorage.setItem("a", "{not json");
    localStorage.setItem("b", JSON.stringify({ ...fields, pain: 4 }));
    localStorage.setItem("c", JSON.stringify({ subjective: "x" }));
    localStorage.setItem("d", "null");
    for (const key of ["a", "b", "c", "d"]) expect(readDraft(key), key).toBeNull();
  });

  it("drops unknown keys", () => {
    localStorage.setItem("k", JSON.stringify({ ...fields, extra: "x" }));
    expect(readDraft("k")).toEqual(fields);
  });

  it("never throws when storage is unavailable", () => {
    const broken = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const blockedSet = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const blockedRemove = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readDraft("k")).toBeNull();
    expect(() => writeDraft("k", fields)).not.toThrow();
    expect(() => clearDraft("k")).not.toThrow();
    broken.mockRestore();
    blockedSet.mockRestore();
    blockedRemove.mockRestore();
  });
});
