import { afterEach, describe, expect, it, vi } from "vitest";

import { SOAP_MAX } from "@/lib/visit-notes";

import { visitNoteFieldErrors, visitNoteSchema } from "./schemas";

const CASE_ID = "0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10";

describe("visitNoteSchema", () => {
  it("accepts a note with one SOAP section and trims text", () => {
    const parsed = visitNoteSchema.parse({ assessment: "  Improving\n" });
    expect(parsed).toEqual({
      visitedOn: null,
      caseId: null,
      subjective: null,
      objective: null,
      assessment: "Improving",
      plan: null,
      pain: null,
    });
  });

  it("keeps date, case and pain when given", () => {
    const parsed = visitNoteSchema.parse({
      visitedOn: "2026-10-01",
      caseId: CASE_ID,
      subjective: "Knee pain on stairs",
      pain: "4",
    });
    expect(parsed).toMatchObject({ visitedOn: "2026-10-01", caseId: CASE_ID, pain: 4 });
  });

  it("requires at least one non-blank SOAP section", () => {
    const result = visitNoteSchema.safeParse({ subjective: "  ", objective: "", pain: "3" });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(visitNoteFieldErrors(result.error)).toEqual({ soap: "soapRequired" });
  });

  it("rejects pain outside 0-10 or non-integer", () => {
    for (const pain of ["-1", "11", "2.5", "abc"]) {
      const result = visitNoteSchema.safeParse({ subjective: "x", pain });
      expect(result.success, pain).toBe(false);
      if (!result.success) expect(visitNoteFieldErrors(result.error).pain).toBe("painOutOfRange");
    }
    expect(visitNoteSchema.parse({ subjective: "x", pain: "0" }).pain).toBe(0);
    expect(visitNoteSchema.parse({ subjective: "x", pain: "10" }).pain).toBe(10);
  });

  it("rejects an invalid date or case id", () => {
    const badDate = visitNoteSchema.safeParse({ subjective: "x", visitedOn: "2026-02-30" });
    expect(badDate.success).toBe(false);
    if (!badDate.success) expect(visitNoteFieldErrors(badDate.error).visitedOn).toBe("dateInvalid");

    const badCase = visitNoteSchema.safeParse({ subjective: "x", caseId: "nope" });
    expect(badCase.success).toBe(false);
    if (!badCase.success) expect(visitNoteFieldErrors(badCase.error).caseId).toBe("invalid");
  });

  describe("visit date upper bound", () => {
    afterEach(() => vi.useRealTimers());

    it("allows today everywhere on Earth (UTC+14 is already tomorrow) but not later", () => {
      vi.useFakeTimers({ now: new Date("2026-10-01T12:00:00Z") });
      expect(visitNoteSchema.safeParse({ subjective: "x", visitedOn: "2026-10-02" }).success).toBe(
        true,
      );
      const result = visitNoteSchema.safeParse({ subjective: "x", visitedOn: "2026-10-03" });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(visitNoteFieldErrors(result.error).visitedOn).toBe("dateInFuture");
      }
    });

    it("rejects a typo like 2062", () => {
      const result = visitNoteSchema.safeParse({ subjective: "x", visitedOn: "2062-03-10" });
      expect(result.success).toBe(false);
    });

    it("accepts past dates", () => {
      expect(visitNoteSchema.safeParse({ subjective: "x", visitedOn: "2020-01-31" }).success).toBe(
        true,
      );
    });
  });

  it("caps each SOAP section at the limit", () => {
    expect(visitNoteSchema.safeParse({ plan: "a".repeat(SOAP_MAX) }).success).toBe(true);
    const result = visitNoteSchema.safeParse({ plan: "a".repeat(SOAP_MAX + 1) });
    expect(result.success).toBe(false);
    if (!result.success) expect(visitNoteFieldErrors(result.error).plan).toBe("tooLong");
  });
});
