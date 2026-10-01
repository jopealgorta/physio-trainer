import { describe, expect, it } from "vitest";

import { PATIENT_HEADERS, isPatientPath } from "./patient-paths";

describe("isPatientPath", () => {
  it("matches /{handle}/{slug}-{code}", () => {
    expect(isPatientPath("/maria-lopez/ana-7k2m9qpx")).toBe(true);
    expect(isPatientPath("/maria-lopez/7k2m9qpx")).toBe(true);
    expect(isPatientPath("/maria-lopez/ana-7k2m9qpx/")).toBe(true);
  });

  it("does not match app routes, other depths or paths without a code", () => {
    expect(isPatientPath("/routines/0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10")).toBe(false);
    expect(isPatientPath("/customers/new")).toBe(false);
    expect(isPatientPath("/library/abcdefgh")).toBe(false); // reserved first segment
    expect(isPatientPath("/maria-lopez")).toBe(false);
    expect(isPatientPath("/maria-lopez/ana")).toBe(false);
    expect(isPatientPath("/maria-lopez/ana-7k2m9qpx/extra")).toBe(false);
    expect(isPatientPath("/")).toBe(false);
  });
});

describe("PATIENT_HEADERS", () => {
  it("keeps patient pages private, unindexed and referrer-free", () => {
    expect(PATIENT_HEADERS).toEqual({
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    });
  });
});
