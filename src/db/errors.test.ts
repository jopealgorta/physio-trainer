import { describe, expect, it } from "vitest";

import { isCheckViolation, isForeignKeyViolation, isUniqueViolation } from "./errors";

const wrapped = (code: string, constraint_name?: string) => ({
  message: "Failed query",
  cause: { code, constraint_name },
});

describe("postgres error helpers", () => {
  it("recognises wrapped errors by code and constraint", () => {
    expect(isForeignKeyViolation(wrapped("23503", "exercises_category_fk"))).toBe(true);
    expect(isForeignKeyViolation(wrapped("23503", "other"), "exercises_category_fk")).toBe(false);
    expect(
      isCheckViolation(
        wrapped("23514", "exercise_categories_max_depth"),
        "exercise_categories_max_depth",
      ),
    ).toBe(true);
    expect(isUniqueViolation(wrapped("23503"))).toBe(false);
    expect(isForeignKeyViolation(new Error("boom"))).toBe(false);
  });
});
