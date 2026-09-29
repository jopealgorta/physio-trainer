import { expect, it } from "vitest";

import { PRESCRIPTION_FIELDS } from "@/lib/prescription";

import { prescriptionColumns } from "./_prescription";

it("has one column per prescription field (spec 05 reuses both)", () => {
  expect(Object.keys(prescriptionColumns()).sort()).toEqual([...PRESCRIPTION_FIELDS].sort());
});
