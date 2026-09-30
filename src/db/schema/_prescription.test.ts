import { expect, it } from "vitest";

import {
  itemPrescriptionColumns,
  prescriptionColumns,
  setPrescriptionColumns,
} from "./_prescription";

// Legacy exercise defaults: the columns stay until a follow-up chore PR drops them (spec 05).
it("keeps the legacy prescription columns until they are dropped", () => {
  expect(Object.keys(prescriptionColumns()).sort()).toEqual(
    [
      "durationSeconds",
      "holdSeconds",
      "load",
      "notes",
      "repsMax",
      "reps",
      "restSeconds",
      "side",
      "sets",
    ].sort(),
  );
});

it("splits the routine prescription into per-item and per-set columns", () => {
  expect(Object.keys(itemPrescriptionColumns()).sort()).toEqual(
    ["holdSeconds", "notes", "restSeconds", "side"].sort(),
  );
  expect(Object.keys(setPrescriptionColumns()).sort()).toEqual(
    ["durationSeconds", "load", "reps", "repsMax"].sort(),
  );
});
