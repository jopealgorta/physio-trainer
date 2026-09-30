import { expect, it } from "vitest";

import { itemPrescriptionColumns, setPrescriptionColumns } from "./_prescription";

it("splits the routine prescription into per-item and per-set columns", () => {
  expect(Object.keys(itemPrescriptionColumns()).sort()).toEqual(
    ["holdSeconds", "notes", "restSeconds", "side"].sort(),
  );
  expect(Object.keys(setPrescriptionColumns()).sort()).toEqual(
    ["durationSeconds", "load", "reps", "repsMax"].sort(),
  );
});
