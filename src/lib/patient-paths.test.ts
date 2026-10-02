import { describe, expect, it } from "vitest";

import { PATIENT_HEADERS, buildWorkoutPath, isPatientPath, isUuid } from "./patient-paths";

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

  it("matches the workout page under a link, so it gets the same private headers", () => {
    expect(isPatientPath("/maria-lopez/ana-7k2m9qpx/workout/0b0e5a2e")).toBe(true);
    expect(isPatientPath("/maria-lopez/ana-7k2m9qpx/workout")).toBe(false);
    expect(isPatientPath("/maria-lopez/ana-7k2m9qpx/other/0b0e5a2e")).toBe(false);
    expect(isPatientPath("/library/ana-7k2m9qpx/workout/0b0e5a2e")).toBe(false);
    expect(isPatientPath("/maria-lopez/ana/workout/0b0e5a2e")).toBe(false);
  });
});

describe("buildWorkoutPath", () => {
  it("appends the routine and the optional plan entry", () => {
    expect(buildWorkoutPath("/maria-lopez/ana-7k2m9qpx", "r1")).toBe(
      "/maria-lopez/ana-7k2m9qpx/workout/r1",
    );
    expect(buildWorkoutPath("/maria-lopez/ana-7k2m9qpx", "r1", "e 1")).toBe(
      "/maria-lopez/ana-7k2m9qpx/workout/r1?entry=e%201",
    );
  });
});

describe("isUuid", () => {
  it("accepts database ids only", () => {
    expect(isUuid("0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10")).toBe(true);
    expect(isUuid("0b0e5a2e")).toBe(false);
    expect(isUuid("../../etc")).toBe(false);
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
