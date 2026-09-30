import { expect, it } from "vitest";

import { prescriptionColumns } from "./_prescription";

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
